import type {
  Card,
  CardKind,
  DyingResume,
  PendingMassAttackResponse,
  PendingNullificationResponse,
  PendingSlashResponse,
  PendingTrickEffect,
  PlayerId,
  SlashResolutionContinuation,
  SlashUseProvenance,
  ShenfenContinuation,
  StandardDamageAftermath,
  WumouContinuation,
  YeyanContinuation,
} from "../types.js";
import { CARD_DEFINITIONS } from "../cards.js";
import type {
  DamageFlowCallerContinuation,
  DamageFlowJsonObject,
} from "./damage-flow.js";

/** Root-only game continuation retained by a live DamageFlow frame. */
export const GAME_DAMAGE_CONTINUATION_TYPE = "game_session.damage_resume.v1" as const;

/** A business continuation may nest through standard-damage aftermath at most this deeply. */
export const GAME_DAMAGE_CONTINUATION_MAX_DEPTH = 32 as const;

/** Engine-owned damage_flow cursors are never caller/business continuations. */
export type GameDamageResume = Exclude<DyingResume, { readonly type: "damage_flow" }>;

export interface GameDamageContinuationData extends DamageFlowJsonObject {
  readonly resume: DamageFlowJsonObject;
}

export interface GameDamageContinuation extends DamageFlowCallerContinuation {
  readonly type: typeof GAME_DAMAGE_CONTINUATION_TYPE;
  readonly data: GameDamageContinuationData;
}

export class GameDamageContinuationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "GameDamageContinuationError";
    this.path = path;
  }
}

const MAX_JSON_STRUCTURE_DEPTH = 256;
const MAX_PLAYER_ID_LENGTH = 200;
const MAX_CARD_ID_LENGTH = 100;
const STANDARD_DAMAGE_SKILL_IDS = ["jianxiong", "yiji", "fankui", "ganglie"] as const;
const LORD_DISPATCH_SKILL_IDS = ["hujia", "jijiang"] as const;
const SLASH_KINDS = ["slash", "fire_slash", "thunder_slash"] as const;
const DAMAGE_NATURES = ["normal", "fire", "thunder"] as const;
const ELEMENTAL_NATURES = ["fire", "thunder"] as const;
const CARD_COLORS = ["red", "black", "colorless"] as const;
const CARD_SUITS = ["spade", "heart", "club", "diamond"] as const;
const MASS_ATTACK_KINDS = ["barbarian_invasion", "arrow_barrage"] as const;
const MASS_ATTACK_RESPONSES = ["slash", "dodge"] as const;
const MASS_ATTACK_SOURCE_SKILL_IDS = ["luanji"] as const;
const SLASH_DESTINATIONS = ["play", "before_play", "discard_or_end"] as const;
const SLASH_SOURCE_SKILL_IDS = ["shensu"] as const;
const CARD_USE_METHODS = ["use", "respond", "recast"] as const;
const TURN_PHASES = ["prepare", "judgment", "draw", "play", "respond", "discard", "end"] as const;
const CARD_KINDS = Object.keys(CARD_DEFINITIONS) as CardKind[];
const ORDINARY_TRICK_KINDS = [
  "ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden",
  "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace", "borrowed_sword", "iron_chain",
] as const;
const NULLIFIABLE_TRICK_KINDS = [
  ...ORDINARY_TRICK_KINDS,
  "le_bu_si_shu", "bing_liang_cun_duan", "shan_dian",
] as const;

function invalid(path: string, message: string): never {
  throw new GameDamageContinuationError(path, message);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Reject every value that JSON cannot preserve exactly. In particular this
 * rejects accessors, sparse/custom arrays, symbols, non-plain objects, cycles,
 * undefined, bigint and non-finite numbers before any domain parsing occurs.
 */
function assertStrictJson(value: unknown, rootPath: string): void {
  const ancestors: object[] = [];

  const visit = (candidate: unknown, path: string, structureDepth: number): void => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) invalid(path, "number must be finite");
      return;
    }
    if (typeof candidate !== "object") invalid(path, "value is not strict JSON");
    if (structureDepth > MAX_JSON_STRUCTURE_DEPTH) invalid(path, "JSON structure is too deeply nested");
    if (ancestors.includes(candidate)) invalid(path, "value contains a cycle");

    ancestors.push(candidate);
    if (Array.isArray(candidate)) {
      const keys = Reflect.ownKeys(candidate);
      const expectedKeys = new Set<string>(["length", ...candidate.map((_entry, index) => String(index))]);
      if (keys.some((key) => typeof key !== "string" || !expectedKeys.has(key)) || keys.length !== expectedKeys.size) {
        invalid(path, "array must be dense and have no custom properties");
      }
      for (let index = 0; index < candidate.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(candidate, index)) invalid(`${path}[${index}]`, "sparse arrays are not allowed");
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          invalid(`${path}[${index}]`, "array entries must be enumerable data properties");
        }
        visit(descriptor.value, `${path}[${index}]`, structureDepth + 1);
      }
    } else {
      if (!isPlainRecord(candidate)) invalid(path, "object must have a plain or null prototype");
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") invalid(path, "symbol keys are not allowed");
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          invalid(`${path}.${key}`, "object fields must be enumerable data properties");
        }
        visit(descriptor.value, `${path}.${key}`, structureDepth + 1);
      }
    }
    ancestors.pop();
  };

  visit(value, rootPath, 0);
}

function exactRecord(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isPlainRecord(value)) invalid(path, "expected an object");
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${path}.${key}`, "unexpected field");
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid(`${path}.${key}`, "required field is missing");
  }
  return value;
}

function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    invalid(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T[number];
}

function parseNonemptyId(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximumLength) {
    invalid(path, `expected a nonempty string of at most ${maximumLength} characters`);
  }
  return value;
}

function parsePlayerId(value: unknown, path: string): string {
  return parseNonemptyId(value, path, MAX_PLAYER_ID_LENGTH);
}

function parseCardId(value: unknown, path: string, maximumLength = MAX_CARD_ID_LENGTH): string {
  return parseNonemptyId(value, path, maximumLength);
}

function parseInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(path, `expected a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "expected a boolean");
  return value;
}

function parseUniqueArray<T>(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number,
  parseEntry: (entry: unknown, path: string) => T,
): T[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    invalid(path, `expected an array with ${minimumLength} through ${maximumLength} entries`);
  }
  const parsed = value.map((entry, index) => parseEntry(entry, `${path}[${index}]`));
  if (new Set(parsed).size !== parsed.length) invalid(path, "array entries must be unique");
  return parsed;
}

function parseDeclinedLordSkills(value: unknown, path: string): Array<"hujia" | "jijiang"> {
  return parseUniqueArray(value, path, 0, 2, (entry, entryPath) =>
    parseEnum(entry, LORD_DISPATCH_SKILL_IDS, entryPath));
}

function parseCard(value: unknown, path: string): Card {
  const record = exactRecord(value, path, ["id", "kind", "name", "category", "suit", "rank"]);
  const kind = parseEnum(record.kind, CARD_KINDS, `${path}.kind`);
  const definition = CARD_DEFINITIONS[kind];
  if (record.name !== definition.name) invalid(`${path}.name`, "does not match the card kind");
  if (record.category !== definition.category) invalid(`${path}.category`, "does not match the card kind");
  return {
    id: parseCardId(record.id, `${path}.id`),
    kind,
    name: definition.name,
    category: definition.category,
    suit: parseEnum(record.suit, CARD_SUITS, `${path}.suit`),
    rank: parseInteger(record.rank, `${path}.rank`, 1, 13) as Card["rank"],
  };
}

function trickEffectSourceId(effect: PendingTrickEffect): string {
  return effect.type === "mass_attack" ? effect.pending.attackerId : effect.sourceId;
}

function trickEffectTargetId(effect: PendingTrickEffect): string {
  return effect.type === "mass_attack" ? effect.pending.targetId : effect.targetId;
}

function trickEffectCardId(effect: PendingTrickEffect): string {
  return effect.type === "mass_attack" ? effect.pending.cardId : effect.cardId;
}

function trickEffectKind(effect: PendingTrickEffect): PendingNullificationResponse["cardKind"] {
  if (effect.type === "mass_attack") return effect.pending.cardKind;
  if (effect.type === "delayed_trick" || effect.type === "zone_trick") return effect.cardKind;
  return effect.type;
}

function parseTrickEffect(value: unknown, path: string): PendingTrickEffect {
  if (!isPlainRecord(value) || typeof value.type !== "string") invalid(path, "expected a tagged trick effect");
  switch (value.type) {
    case "ex_nihilo":
    case "duel":
    case "fire_attack": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "cardId"]);
      return {
        type: value.type,
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
      };
    }
    case "mass_attack": {
      const record = exactRecord(value, path, ["type", "pending"]);
      return { type: "mass_attack", pending: parseMassAttackPending(record.pending, `${path}.pending`) };
    }
    case "peach_garden":
    case "iron_chain": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "cardId", "remainingTargetIds"]);
      return {
        type: value.type,
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
        remainingTargetIds: parseUniqueArray(record.remainingTargetIds, `${path}.remainingTargetIds`, 0, 9, parsePlayerId),
      };
    }
    case "delayed_trick": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "cardId", "cardKind"]);
      return {
        type: "delayed_trick",
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
        cardKind: parseEnum(record.cardKind, ["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"] as const, `${path}.cardKind`),
      };
    }
    case "zone_trick": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "cardId", "cardKind"]);
      return {
        type: "zone_trick",
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
        cardKind: parseEnum(record.cardKind, ["guo_he_chai_qiao", "shun_shou_qian_yang"] as const, `${path}.cardKind`),
      };
    }
    case "borrowed_sword": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "attackTargetId", "cardId"]);
      return {
        type: "borrowed_sword",
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        attackTargetId: parsePlayerId(record.attackTargetId, `${path}.attackTargetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
      };
    }
    case "amazing_grace": {
      const record = exactRecord(value, path, ["type", "sourceId", "targetId", "cardId", "pool", "remainingTargetIds"]);
      if (!Array.isArray(record.pool) || record.pool.length > 10) invalid(`${path}.pool`, "expected at most ten public cards");
      const pool = record.pool.map((entry, index) => parseCard(entry, `${path}.pool[${index}]`));
      if (new Set(pool.map((card) => card.id)).size !== pool.length) invalid(`${path}.pool`, "card ids must be unique");
      return {
        type: "amazing_grace",
        sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
        targetId: parsePlayerId(record.targetId, `${path}.targetId`),
        cardId: parseCardId(record.cardId, `${path}.cardId`),
        pool,
        remainingTargetIds: parseUniqueArray(record.remainingTargetIds, `${path}.remainingTargetIds`, 0, 9, parsePlayerId),
      };
    }
    default:
      invalid(`${path}.type`, "unsupported trick effect type");
  }
}

function parseNullificationPending(value: unknown, path: string): PendingNullificationResponse {
  const record = exactRecord(value, path, [
    "type", "attackerId", "targetId", "effectTargetId", "cardId", "cardKind",
    "remainingResponderIds", "negated", "effect",
  ]);
  if (record.type !== "nullification") invalid(`${path}.type`, "expected nullification");
  const effect = parseTrickEffect(record.effect, `${path}.effect`);
  const attackerId = parsePlayerId(record.attackerId, `${path}.attackerId`);
  const effectTargetId = parsePlayerId(record.effectTargetId, `${path}.effectTargetId`);
  const cardId = parseCardId(record.cardId, `${path}.cardId`);
  const cardKind = parseEnum(record.cardKind, NULLIFIABLE_TRICK_KINDS, `${path}.cardKind`);
  if (attackerId !== trickEffectSourceId(effect) || effectTargetId !== trickEffectTargetId(effect) ||
      cardId !== trickEffectCardId(effect) || cardKind !== trickEffectKind(effect)) {
    invalid(path, "nullification metadata does not match its trick effect");
  }
  return {
    type: "nullification",
    attackerId,
    targetId: parsePlayerId(record.targetId, `${path}.targetId`),
    effectTargetId,
    cardId,
    cardKind,
    remainingResponderIds: parseUniqueArray(record.remainingResponderIds, `${path}.remainingResponderIds`, 0, 9, parsePlayerId),
    negated: parseBoolean(record.negated, `${path}.negated`),
    effect,
  };
}

function parseWumouContinuation(value: unknown, path: string): WumouContinuation {
  if (!isPlainRecord(value) || typeof value.type !== "string") invalid(path, "expected a tagged Wumou continuation");
  if (value.type === "trick_effect") {
    const record = exactRecord(value, path, ["type", "cardKind", "effect"]);
    const cardKind = parseEnum(record.cardKind, ORDINARY_TRICK_KINDS, `${path}.cardKind`);
    const effect = parseTrickEffect(record.effect, `${path}.effect`);
    if (effect.type === "delayed_trick" || trickEffectKind(effect) !== cardKind) {
      invalid(path, "Wumou trick metadata must describe one ordinary trick");
    }
    return { type: "trick_effect", cardKind, effect } as WumouContinuation;
  }
  if (value.type === "finish_trick") {
    const record = exactRecord(value, path, ["type", "sourceId", "cardId", "cardKind"]);
    return {
      type: "finish_trick",
      sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
      cardId: parseCardId(record.cardId, `${path}.cardId`),
      cardKind: parseEnum(record.cardKind, ["peach_garden", "amazing_grace"] as const, `${path}.cardKind`),
    };
  }
  if (value.type === "finish_mass_attack") {
    const record = exactRecord(value, path, ["type", "sourceId", "cardId", "damageCardIds", "cardKind"], ["sourceSkillId"]);
    const sourceSkillId = has(record, "sourceSkillId")
      ? parseEnum(record.sourceSkillId, MASS_ATTACK_SOURCE_SKILL_IDS, `${path}.sourceSkillId`)
      : undefined;
    const damageCardIds = parseUniqueArray(
      record.damageCardIds,
      `${path}.damageCardIds`,
      sourceSkillId === "luanji" ? 2 : 1,
      sourceSkillId === "luanji" ? 2 : 1,
      parseCardId,
    );
    const cardId = parseCardId(record.cardId, `${path}.cardId`);
    if (!damageCardIds.includes(cardId)) invalid(`${path}.damageCardIds`, "must include cardId");
    return {
      type: "finish_mass_attack",
      sourceId: parsePlayerId(record.sourceId, `${path}.sourceId`),
      cardId,
      damageCardIds,
      ...(sourceSkillId ? { sourceSkillId } : {}),
      cardKind: parseEnum(record.cardKind, MASS_ATTACK_KINDS, `${path}.cardKind`),
    };
  }
  if (value.type === "nullification") {
    const record = exactRecord(value, path, ["type", "responderId", "responseCardId", "pending"]);
    return {
      type: "nullification",
      responderId: parsePlayerId(record.responderId, `${path}.responderId`),
      responseCardId: parseCardId(record.responseCardId, `${path}.responseCardId`),
      pending: parseNullificationPending(record.pending, `${path}.pending`),
    };
  }
  invalid(`${path}.type`, "unsupported Wumou continuation type");
}

function parseShenfenContinuation(value: unknown, path: string): ShenfenContinuation {
  const record = exactRecord(value, path, ["eventId", "ownerId", "targetIds", "stage", "nextTargetIndex"]);
  const ownerId = parsePlayerId(record.ownerId, `${path}.ownerId`);
  const targetIds = parseUniqueArray(record.targetIds, `${path}.targetIds`, 0, 9, parsePlayerId);
  if (targetIds.includes(ownerId)) invalid(`${path}.targetIds`, "must not include the Shenfen owner");
  const stage = parseEnum(record.stage, ["damage", "equipment", "hand", "turn_over"] as const, `${path}.stage`);
  const nextTargetIndex = parseInteger(record.nextTargetIndex, `${path}.nextTargetIndex`, 0, targetIds.length);
  if (stage === "turn_over" && nextTargetIndex !== targetIds.length) {
    invalid(`${path}.nextTargetIndex`, "turn_over must follow every frozen target");
  }
  return {
    eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
    ownerId,
    targetIds,
    stage,
    nextTargetIndex,
  };
}

function parseYeyanContinuation(value: unknown, path: string): YeyanContinuation {
  const record = exactRecord(value, path, [
    "eventId", "ownerId", "greaterYeyan", "costCardIds", "allocations", "stage", "nextAllocationIndex",
  ]);
  const ownerId = parsePlayerId(record.ownerId, `${path}.ownerId`);
  const greaterYeyan = parseBoolean(record.greaterYeyan, `${path}.greaterYeyan`);
  const costCardIds = parseUniqueArray(record.costCardIds, `${path}.costCardIds`, greaterYeyan ? 4 : 0, greaterYeyan ? 4 : 0, parseCardId);
  if (!Array.isArray(record.allocations) || record.allocations.length < 1 || record.allocations.length > 3) {
    invalid(`${path}.allocations`, "must contain one through three allocations");
  }
  const seen = new Set<PlayerId>();
  let totalDamage = 0;
  const allocations = record.allocations.map((value, index) => {
    const allocationPath = `${path}.allocations[${index}]`;
    const allocation = exactRecord(value, allocationPath, ["targetId", "amount"]);
    const targetId = parsePlayerId(allocation.targetId, `${allocationPath}.targetId`);
    if (seen.has(targetId)) invalid(`${allocationPath}.targetId`, "duplicates an earlier target");
    seen.add(targetId);
    const amount = parseInteger(allocation.amount, `${allocationPath}.amount`, 1, 3);
    totalDamage += amount;
    return { targetId, amount };
  });
  if (totalDamage > 3) invalid(`${path}.allocations`, "assigns more than three total damage");
  const hasGreaterAllocation = allocations.some((allocation) => allocation.amount >= 2);
  if (hasGreaterAllocation !== greaterYeyan) {
    invalid(`${path}.greaterYeyan`, "must match whether an allocation is at least two damage");
  }
  const stage = parseEnum(record.stage, ["after_cost", "damage"] as const, `${path}.stage`);
  const nextAllocationIndex = parseInteger(
    record.nextAllocationIndex,
    `${path}.nextAllocationIndex`,
    0,
    allocations.length,
  );
  if (stage === "after_cost" && (!greaterYeyan || nextAllocationIndex !== 0)) {
    invalid(path, "after_cost is valid only for great Yeyan before any allocation");
  }
  return {
    eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
    ownerId,
    greaterYeyan,
    costCardIds,
    allocations,
    stage,
    nextAllocationIndex,
  };
}

function parseSlashCompletion(value: unknown, path: string): SlashResolutionContinuation {
  const record = exactRecord(
    value,
    path,
    ["type"],
    ["continuationId", "playerId", "destination", "eventId", "ownerId", "processedActorIds", "remainingActorIds"],
  );
  if (record.type === "default") {
    exactRecord(record, path, ["type"]);
    return { type: "default" };
  }
  if (record.type === "turn_flow") {
    exactRecord(record, path, ["type", "continuationId", "playerId", "destination"]);
    return {
      type: "turn_flow",
      continuationId: parseInteger(record.continuationId, `${path}.continuationId`, 1, Number.MAX_SAFE_INTEGER),
      playerId: parsePlayerId(record.playerId, `${path}.playerId`),
      destination: parseEnum(record.destination, SLASH_DESTINATIONS, `${path}.destination`),
    };
  }
  if (record.type === "luanwu") {
    exactRecord(record, path, ["type", "eventId", "ownerId", "processedActorIds", "remainingActorIds"]);
    const processedActorIds = parseUniqueArray(record.processedActorIds, `${path}.processedActorIds`, 0, 9, parsePlayerId);
    const remainingActorIds = parseUniqueArray(record.remainingActorIds, `${path}.remainingActorIds`, 0, 9, parsePlayerId);
    if (new Set([...processedActorIds, ...remainingActorIds]).size !== processedActorIds.length + remainingActorIds.length) {
      invalid(path, "Luanwu actor partitions must be disjoint");
    }
    return {
      type: "luanwu",
      eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
      ownerId: parsePlayerId(record.ownerId, `${path}.ownerId`),
      processedActorIds,
      remainingActorIds,
    };
  }
  invalid(`${path}.type`, "unsupported Slash completion type");
}

function parseSlashUseProvenance(value: unknown, path: string): SlashUseProvenance {
  const record = exactRecord(value, path, ["method", "turnPlayerId", "phase"]);
  return {
    method: parseEnum(record.method, CARD_USE_METHODS, `${path}.method`),
    turnPlayerId: parsePlayerId(record.turnPlayerId, `${path}.turnPlayerId`),
    phase: parseEnum(record.phase, TURN_PHASES, `${path}.phase`),
  };
}

function parseMassAttackPending(value: unknown, path: string): PendingMassAttackResponse {
  const record = exactRecord(
    value,
    path,
    ["type", "attackerId", "targetId", "cardId", "cardKind", "responseKind", "remainingTargetIds"],
    ["damageCardIds", "sourceSkillId", "effectiveSuit", "huoshouSourceId", "armorAttempted", "declinedLordSkillIds"],
  );
  if (record.type !== "mass_attack") invalid(`${path}.type`, "expected mass_attack");
  const cardId = parseCardId(record.cardId, `${path}.cardId`, 80);
  const sourceSkillId = has(record, "sourceSkillId")
    ? parseEnum(record.sourceSkillId, MASS_ATTACK_SOURCE_SKILL_IDS, `${path}.sourceSkillId`)
    : null;
  const damageCardIds = has(record, "damageCardIds")
    ? parseUniqueArray(
        record.damageCardIds,
        `${path}.damageCardIds`,
        sourceSkillId === "luanji" ? 2 : 1,
        sourceSkillId === "luanji" ? 2 : 1,
        parseCardId,
      )
    : null;
  if (sourceSkillId === "luanji" && damageCardIds === null) {
    invalid(`${path}.damageCardIds`, "Luanji requires exactly two physical card ids");
  }
  if (damageCardIds !== null && !damageCardIds.includes(cardId)) {
    invalid(`${path}.damageCardIds`, "must include the primary cardId");
  }
  const cardKind = parseEnum(record.cardKind, MASS_ATTACK_KINDS, `${path}.cardKind`);
  if (cardKind !== "barbarian_invasion" && has(record, "huoshouSourceId")) {
    invalid(`${path}.huoshouSourceId`, "is valid only for Nanman Invasion");
  }
  const result: PendingMassAttackResponse = {
    type: "mass_attack",
    attackerId: parsePlayerId(record.attackerId, `${path}.attackerId`),
    targetId: parsePlayerId(record.targetId, `${path}.targetId`),
    cardId,
    ...(damageCardIds ? { damageCardIds } : {}),
    ...(sourceSkillId ? { sourceSkillId } : {}),
    cardKind,
    responseKind: parseEnum(record.responseKind, MASS_ATTACK_RESPONSES, `${path}.responseKind`),
    ...(has(record, "effectiveSuit")
      ? { effectiveSuit: parseEnum(record.effectiveSuit, CARD_SUITS, `${path}.effectiveSuit`) }
      : {}),
    ...(has(record, "huoshouSourceId")
      ? { huoshouSourceId: record.huoshouSourceId === null
          ? null
          : parsePlayerId(record.huoshouSourceId, `${path}.huoshouSourceId`) }
      : {}),
    remainingTargetIds: parseUniqueArray(record.remainingTargetIds, `${path}.remainingTargetIds`, 0, 9, parsePlayerId),
    declinedLordSkillIds: has(record, "declinedLordSkillIds")
      ? parseDeclinedLordSkills(record.declinedLordSkillIds, `${path}.declinedLordSkillIds`)
      : [],
    ...(has(record, "armorAttempted")
      ? { armorAttempted: parseBoolean(record.armorAttempted, `${path}.armorAttempted`) }
      : {}),
  };
  return result;
}

function defaultExcludedSlashTargets(
  attackerId: string,
  targetId: string,
  remainingTargetIds: readonly string[],
): string[] {
  return [...new Set([attackerId, targetId, ...remainingTargetIds])];
}

function parseSlashPending(value: unknown, path: string): PendingSlashResponse {
  const record = exactRecord(
    value,
    path,
    ["type", "attackerId", "targetId", "cardId"],
    [
      "damageCardIds", "sourceSkillId", "slashKind", "damage", "nature", "color", "armorAttempted", "armorIgnored",
      "requiredDodgeCount", "dodgesPlayed", "remainingTargetIds", "zhuQueChecked", "ciXiongChecked",
      "liuliCheckedPlayerIds", "xiangleCheckedPlayerIds", "jiangProcessedPlayerIds",
      "liegongChecked", "tieqiChecked", "useProvenance",
      "excludedRedirectTargetIds", "dodgeProhibited", "completion",
      "declinedLordSkillIds",
    ],
  );
  if (record.type !== "slash") invalid(`${path}.type`, "expected slash");

  const attackerId = parsePlayerId(record.attackerId, `${path}.attackerId`);
  const targetId = parsePlayerId(record.targetId, `${path}.targetId`);
  const cardId = parseCardId(record.cardId, `${path}.cardId`);
  const sourceSkillId = has(record, "sourceSkillId")
    ? parseEnum(record.sourceSkillId, SLASH_SOURCE_SKILL_IDS, `${path}.sourceSkillId`)
    : undefined;
  const remainingTargetIds = has(record, "remainingTargetIds")
    ? parseUniqueArray(record.remainingTargetIds, `${path}.remainingTargetIds`, 0, 2, parsePlayerId)
    : [];
  const requiredDodgeCount = has(record, "requiredDodgeCount")
    ? parseInteger(record.requiredDodgeCount, `${path}.requiredDodgeCount`, 1, 2)
    : 1;
  const dodgesPlayed = has(record, "dodgesPlayed")
    ? parseInteger(record.dodgesPlayed, `${path}.dodgesPlayed`, 0, 2)
    : 0;
  if (dodgesPlayed > requiredDodgeCount) {
    invalid(`${path}.dodgesPlayed`, "cannot exceed requiredDodgeCount");
  }

  return {
    type: "slash",
    attackerId,
    targetId,
    cardId,
    damageCardIds: has(record, "damageCardIds")
      ? parseUniqueArray(record.damageCardIds, `${path}.damageCardIds`, sourceSkillId === "shensu" ? 0 : 1, sourceSkillId === "shensu" ? 0 : 2, parseCardId)
      : sourceSkillId === "shensu" ? [] : [cardId],
    ...(sourceSkillId ? { sourceSkillId } : {}),
    slashKind: has(record, "slashKind")
      ? parseEnum(record.slashKind, SLASH_KINDS, `${path}.slashKind`)
      : "slash",
    damage: has(record, "damage")
      ? parseInteger(record.damage, `${path}.damage`, 1, 10)
      : 1,
    nature: has(record, "nature")
      ? parseEnum(record.nature, DAMAGE_NATURES, `${path}.nature`)
      : "normal",
    color: has(record, "color")
      ? parseEnum(record.color, CARD_COLORS, `${path}.color`)
      : "colorless",
    ...(has(record, "armorAttempted")
      ? { armorAttempted: parseBoolean(record.armorAttempted, `${path}.armorAttempted`) }
      : {}),
    ...(has(record, "armorIgnored")
      ? { armorIgnored: parseBoolean(record.armorIgnored, `${path}.armorIgnored`) }
      : {}),
    requiredDodgeCount,
    dodgesPlayed,
    remainingTargetIds,
    zhuQueChecked: has(record, "zhuQueChecked")
      ? parseBoolean(record.zhuQueChecked, `${path}.zhuQueChecked`)
      : true,
    ciXiongChecked: has(record, "ciXiongChecked")
      ? parseBoolean(record.ciXiongChecked, `${path}.ciXiongChecked`)
      : true,
    liuliCheckedPlayerIds: has(record, "liuliCheckedPlayerIds")
      ? parseUniqueArray(record.liuliCheckedPlayerIds, `${path}.liuliCheckedPlayerIds`, 0, 10, parsePlayerId)
      : [],
    xiangleCheckedPlayerIds: has(record, "xiangleCheckedPlayerIds")
      ? parseUniqueArray(record.xiangleCheckedPlayerIds, `${path}.xiangleCheckedPlayerIds`, 0, 10, parsePlayerId)
      : [],
    jiangProcessedPlayerIds: has(record, "jiangProcessedPlayerIds")
      ? parseUniqueArray(record.jiangProcessedPlayerIds, `${path}.jiangProcessedPlayerIds`, 0, 10, parsePlayerId)
      : [],
    liegongChecked: has(record, "liegongChecked")
      ? parseBoolean(record.liegongChecked, `${path}.liegongChecked`)
      : false,
    tieqiChecked: has(record, "tieqiChecked")
      ? parseBoolean(record.tieqiChecked, `${path}.tieqiChecked`)
      : false,
    ...(has(record, "useProvenance")
      ? { useProvenance: parseSlashUseProvenance(record.useProvenance, `${path}.useProvenance`) }
      : {}),
    excludedRedirectTargetIds: has(record, "excludedRedirectTargetIds")
      ? parseUniqueArray(record.excludedRedirectTargetIds, `${path}.excludedRedirectTargetIds`, 0, 10, parsePlayerId)
      : defaultExcludedSlashTargets(attackerId, targetId, remainingTargetIds),
    dodgeProhibited: has(record, "dodgeProhibited")
      ? parseBoolean(record.dodgeProhibited, `${path}.dodgeProhibited`)
      : false,
    completion: has(record, "completion")
      ? parseSlashCompletion(record.completion, `${path}.completion`)
      : { type: "default" },
    declinedLordSkillIds: has(record, "declinedLordSkillIds")
      ? parseDeclinedLordSkills(record.declinedLordSkillIds, `${path}.declinedLordSkillIds`)
      : [],
  };
}

function parseStandardDamageAftermath(
  value: unknown,
  path: string,
  resumeDepth: number,
): StandardDamageAftermath {
  const record = exactRecord(
    value,
    path,
    ["eventId", "sourceId", "targetId", "amount", "damageCardIds", "remainingSkillIds", "resume"],
  );
  const sourceId = record.sourceId === null
    ? null
    : parsePlayerId(record.sourceId, `${path}.sourceId`);
  return {
    eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
    sourceId,
    targetId: parsePlayerId(record.targetId, `${path}.targetId`),
    amount: parseInteger(record.amount, `${path}.amount`, 1, 10),
    damageCardIds: parseUniqueArray(record.damageCardIds, `${path}.damageCardIds`, 0, 10, parseCardId),
    remainingSkillIds: parseUniqueArray(record.remainingSkillIds, `${path}.remainingSkillIds`, 0, 4, (entry, entryPath) =>
      parseEnum(entry, STANDARD_DAMAGE_SKILL_IDS, entryPath)),
    resume: parseDyingResume(record.resume, `${path}.resume`, resumeDepth + 1),
  };
}

function parseDyingResume(value: unknown, path: string, depth: number): GameDamageResume {
  if (depth > GAME_DAMAGE_CONTINUATION_MAX_DEPTH) {
    invalid(path, `resume nesting exceeds ${GAME_DAMAGE_CONTINUATION_MAX_DEPTH}`);
  }
  if (!isPlainRecord(value)) invalid(path, "expected a DyingResume object");
  if (typeof value.type !== "string") invalid(`${path}.type`, "expected a string discriminator");

  switch (value.type) {
    case "finish_effect":
      exactRecord(value, path, ["type"]);
      return { type: "finish_effect" };
    case "turn_start":
      exactRecord(value, path, ["type"]);
      return { type: "turn_start" };
    case "skill": {
      const record = exactRecord(value, path, ["type", "skillId", "playerId"]);
      if (record.skillId !== "kurou") invalid(`${path}.skillId`, "only kurou is a valid skill resume");
      return { type: "skill", skillId: "kurou", playerId: parsePlayerId(record.playerId, `${path}.playerId`) };
    }
    case "mass_attack": {
      const record = exactRecord(value, path, ["type", "pending"]);
      return { type: "mass_attack", pending: parseMassAttackPending(record.pending, `${path}.pending`) };
    }
    case "slash_sequence": {
      const record = exactRecord(value, path, ["type", "pending"]);
      return { type: "slash_sequence", pending: parseSlashPending(record.pending, `${path}.pending`) };
    }
    case "leiji": {
      const record = exactRecord(value, path, ["type", "resume"]);
      const leiji = exactRecord(record.resume, `${path}.resume`, ["type", "pending"]);
      if (leiji.type === "slash") {
        return { type: "leiji", resume: { type: "slash", pending: parseSlashPending(leiji.pending, `${path}.resume.pending`) } };
      }
      if (leiji.type === "mass_attack") {
        return { type: "leiji", resume: { type: "mass_attack", pending: parseMassAttackPending(leiji.pending, `${path}.resume.pending`) } };
      }
      invalid(`${path}.resume.type`, "expected slash or mass_attack");
    }
    case "chain_damage": {
      const record = exactRecord(
        value,
        path,
        ["type", "sourceId", "amount", "nature", "remainingTargetIds", "finalResume"],
        ["damageCardIds"],
      );
      const finalResume = parseDyingResume(record.finalResume, `${path}.finalResume`, depth + 1);
      if (finalResume.type === "chain_damage") {
        invalid(`${path}.finalResume.type`, "chain_damage cannot directly resume another chain_damage");
      }
      return {
        type: "chain_damage",
        sourceId: record.sourceId === null ? null : parsePlayerId(record.sourceId, `${path}.sourceId`),
        amount: parseInteger(record.amount, `${path}.amount`, 1, 10),
        nature: parseEnum(record.nature, ELEMENTAL_NATURES, `${path}.nature`),
        damageCardIds: has(record, "damageCardIds")
          ? parseUniqueArray(record.damageCardIds, `${path}.damageCardIds`, 0, 10, parseCardId)
          : [],
        remainingTargetIds: parseUniqueArray(record.remainingTargetIds, `${path}.remainingTargetIds`, 0, 9, parsePlayerId),
        finalResume: finalResume as Exclude<GameDamageResume, { type: "chain_damage" }>,
      };
    }
    case "standard_damage": {
      const record = exactRecord(value, path, ["type", "aftermath"]);
      return {
        type: "standard_damage",
        aftermath: parseStandardDamageAftermath(record.aftermath, `${path}.aftermath`, depth),
      };
    }
    case "wumou": {
      const record = exactRecord(value, path, ["type", "ownerId", "eventId", "continuation"]);
      const ownerId = parsePlayerId(record.ownerId, `${path}.ownerId`);
      const continuation = parseWumouContinuation(record.continuation, `${path}.continuation`);
      const boundOwnerId = continuation.type === "trick_effect"
        ? trickEffectSourceId(continuation.effect)
        : continuation.type === "nullification"
          ? continuation.responderId
          : continuation.sourceId;
      if (boundOwnerId !== ownerId ||
          continuation.type === "nullification" && continuation.pending.targetId !== ownerId) {
        invalid(`${path}.continuation`, "is not bound to the Wumou owner");
      }
      return {
        type: "wumou",
        ownerId,
        eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
        continuation,
      };
    }
    case "shenfen": {
      const record = exactRecord(value, path, ["type", "continuation"]);
      return { type: "shenfen", continuation: parseShenfenContinuation(record.continuation, `${path}.continuation`) };
    }
    case "yeyan": {
      const record = exactRecord(value, path, ["type", "continuation"]);
      return { type: "yeyan", continuation: parseYeyanContinuation(record.continuation, `${path}.continuation`) };
    }
    case "luanwu": {
      const record = exactRecord(value, path, ["type", "eventId", "ownerId", "processedActorIds", "remainingActorIds"]);
      const processedActorIds = parseUniqueArray(record.processedActorIds, `${path}.processedActorIds`, 0, 9, parsePlayerId);
      const remainingActorIds = parseUniqueArray(record.remainingActorIds, `${path}.remainingActorIds`, 0, 9, parsePlayerId);
      if (new Set([...processedActorIds, ...remainingActorIds]).size !== processedActorIds.length + remainingActorIds.length) {
        invalid(path, "Luanwu actor partitions must be disjoint");
      }
      return {
        type: "luanwu",
        eventId: parseInteger(record.eventId, `${path}.eventId`, 1, Number.MAX_SAFE_INTEGER),
        ownerId: parsePlayerId(record.ownerId, `${path}.ownerId`),
        processedActorIds,
        remainingActorIds,
      };
    }
    default:
      // Deliberately rejects every engine-internal cursor (including the
      // forthcoming damage_flow variant): only the root caller's business
      // continuation belongs in this codec.
      invalid(`${path}.type`, "unsupported or engine-internal DyingResume type");
  }
}

/** Encode and normalize one root game-session continuation for DamageFlow. */
export function encodeGameDamageContinuation(resume: GameDamageResume): GameDamageContinuation {
  assertStrictJson(resume, "$resume");
  const normalized = parseDyingResume(resume, "$resume", 1);
  return {
    type: GAME_DAMAGE_CONTINUATION_TYPE,
    data: { resume: normalized as unknown as DamageFlowJsonObject },
  };
}

/** Strictly validate, normalize and deep-clone a continuation from an unknown source. */
export function decodeGameDamageContinuation(continuation: unknown): GameDamageResume {
  assertStrictJson(continuation, "$continuation");
  const record = exactRecord(continuation, "$continuation", ["type", "data"]);
  if (record.type !== GAME_DAMAGE_CONTINUATION_TYPE) {
    invalid("$continuation.type", `expected ${GAME_DAMAGE_CONTINUATION_TYPE}`);
  }
  const data = exactRecord(record.data, "$continuation.data", ["resume"]);
  return parseDyingResume(data.resume, "$continuation.data.resume", 1);
}

/** Assertion-style entry point; returns the same defensive deep copy as decode. */
export function assertGameDamageContinuation(continuation: unknown): GameDamageResume {
  return decodeGameDamageContinuation(continuation);
}
