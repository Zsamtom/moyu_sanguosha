import type {
  DyingResume,
  PendingMassAttackResponse,
  PendingSlashResponse,
  SlashResolutionContinuation,
  StandardDamageAftermath,
} from "../types.js";
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
const MASS_ATTACK_KINDS = ["barbarian_invasion", "arrow_barrage"] as const;
const MASS_ATTACK_RESPONSES = ["slash", "dodge"] as const;
const SLASH_DESTINATIONS = ["play", "discard_or_end"] as const;

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

function parseSlashCompletion(value: unknown, path: string): SlashResolutionContinuation {
  const record = exactRecord(value, path, ["type"], ["continuationId", "playerId", "destination"]);
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
  invalid(`${path}.type`, "unsupported Slash completion type");
}

function parseMassAttackPending(value: unknown, path: string): PendingMassAttackResponse {
  const record = exactRecord(
    value,
    path,
    ["type", "attackerId", "targetId", "cardId", "cardKind", "responseKind", "remainingTargetIds"],
    ["armorAttempted", "declinedLordSkillIds"],
  );
  if (record.type !== "mass_attack") invalid(`${path}.type`, "expected mass_attack");
  const result: PendingMassAttackResponse = {
    type: "mass_attack",
    attackerId: parsePlayerId(record.attackerId, `${path}.attackerId`),
    targetId: parsePlayerId(record.targetId, `${path}.targetId`),
    cardId: parseCardId(record.cardId, `${path}.cardId`, 80),
    cardKind: parseEnum(record.cardKind, MASS_ATTACK_KINDS, `${path}.cardKind`),
    responseKind: parseEnum(record.responseKind, MASS_ATTACK_RESPONSES, `${path}.responseKind`),
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
      "damageCardIds", "slashKind", "damage", "nature", "color", "armorAttempted", "armorIgnored",
      "requiredDodgeCount", "dodgesPlayed", "remainingTargetIds", "zhuQueChecked", "ciXiongChecked",
      "liuliCheckedPlayerIds", "tieqiChecked", "excludedRedirectTargetIds", "dodgeProhibited", "completion",
      "declinedLordSkillIds",
    ],
  );
  if (record.type !== "slash") invalid(`${path}.type`, "expected slash");

  const attackerId = parsePlayerId(record.attackerId, `${path}.attackerId`);
  const targetId = parsePlayerId(record.targetId, `${path}.targetId`);
  const cardId = parseCardId(record.cardId, `${path}.cardId`);
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
      ? parseUniqueArray(record.damageCardIds, `${path}.damageCardIds`, 1, 2, parseCardId)
      : [cardId],
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
    tieqiChecked: has(record, "tieqiChecked")
      ? parseBoolean(record.tieqiChecked, `${path}.tieqiChecked`)
      : false,
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
