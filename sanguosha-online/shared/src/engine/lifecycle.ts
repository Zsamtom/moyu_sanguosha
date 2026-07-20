import type { PlayerId } from "../types.js";
import type { LifePlayerState } from "./damage.js";

export type StateVisibility = "public" | "owner" | "server_only";

export type ExpiryAtom =
  | { readonly type: "phase_end"; readonly phaseInstanceId: number }
  | { readonly type: "turn_end"; readonly turnId: number }
  | { readonly type: "turn_start"; readonly playerId: PlayerId; readonly afterTurnId: number }
  | { readonly type: "source_death"; readonly sourcePlayerId: PlayerId }
  | { readonly type: "owner_death"; readonly ownerId: PlayerId }
  | { readonly type: "skill_lost"; readonly ownerId: PlayerId; readonly skillId: string }
  | { readonly type: "game_end" };

export type Expiry =
  | { readonly type: "permanent" }
  | ExpiryAtom
  /** Expire at the first matching boundary, never after every boundary. */
  | { readonly type: "any_of"; readonly anyOf: readonly ExpiryAtom[] };

export type ExpiryBoundary =
  | { readonly type: "phase_end"; readonly phaseInstanceId: number }
  | { readonly type: "turn_end"; readonly turnId: number }
  | { readonly type: "turn_start"; readonly playerId: PlayerId; readonly turnId: number }
  | { readonly type: "source_death"; readonly sourcePlayerId: PlayerId }
  | { readonly type: "owner_death"; readonly ownerId: PlayerId }
  | { readonly type: "skill_lost"; readonly ownerId: PlayerId; readonly skillId: string }
  | { readonly type: "game_end" };

export interface MarkState {
  readonly markId: string;
  readonly ownerId: PlayerId;
  readonly sourcePlayerId: PlayerId | null;
  readonly sourceSkillId: string;
  value: number;
  readonly visibility: StateVisibility;
  readonly expiry: Expiry;
}

export interface StatusEffect {
  readonly effectId: number;
  readonly ownerId: PlayerId;
  readonly kind: string;
  readonly sourcePlayerId: PlayerId | null;
  readonly sourceSkillId: string;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly visibility: StateVisibility;
  readonly expiry: Expiry;
}

export interface SkillGrant {
  readonly grantId: number;
  readonly ownerId: PlayerId;
  readonly skillId: string;
  readonly sourcePlayerId: PlayerId | null;
  readonly sourceSkillId: string;
  readonly expiry: Expiry;
}

export interface SkillSuppression {
  readonly suppressionId: number;
  readonly ownerId: PlayerId;
  readonly skillId: string | null;
  readonly sourcePlayerId: PlayerId | null;
  readonly sourceSkillId: string;
  readonly expiry: Expiry;
}

export interface LimitedUseState {
  readonly ownerId: PlayerId;
  readonly skillId: string;
  readonly consumedAtEventId: number;
}

export interface AwakeningState {
  readonly ownerId: PlayerId;
  readonly skillId: string;
  readonly awakenedAtEventId: number;
}

/** Snapshot loss of skills that existed at one event; later grants remain possible. */
export interface SkillLossRecord {
  readonly lossId: number;
  readonly ownerId: PlayerId;
  readonly skillIds: readonly string[];
  readonly sourcePlayerId: PlayerId | null;
  readonly sourceSkillId: string;
  readonly lostAtEventId: number;
}

export interface SkillLifecycleState {
  nextEffectId: number;
  marks: MarkState[];
  effects: StatusEffect[];
  grants: SkillGrant[];
  suppressions: SkillSuppression[];
  limitedUses: LimitedUseState[];
  awakenings: AwakeningState[];
  skillLosses: SkillLossRecord[];
}

export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new LifecycleError(`${label} must be positive`);
}

function validateExpiryAtom(expiry: ExpiryAtom): void {
  switch (expiry.type) {
    case "phase_end":
      positive(expiry.phaseInstanceId, "phase instance id");
      return;
    case "turn_end":
      positive(expiry.turnId, "turn id");
      return;
    case "turn_start":
      if (!expiry.playerId) throw new LifecycleError("turn-start expiry requires a player");
      positive(expiry.afterTurnId, "afterTurnId");
      return;
    case "source_death":
      if (!expiry.sourcePlayerId) throw new LifecycleError("source-death expiry requires a source");
      return;
    case "owner_death":
      if (!expiry.ownerId) throw new LifecycleError("owner-death expiry requires an owner");
      return;
    case "skill_lost":
      if (!expiry.ownerId || !expiry.skillId) throw new LifecycleError("skill-lost expiry requires owner and skill");
      return;
    case "game_end":
      return;
    default:
      throw new LifecycleError("unknown expiry atom");
  }
}

function validateExpiry(expiry: Expiry): void {
  if (expiry.type === "permanent") return;
  if (expiry.type === "any_of") {
    if (expiry.anyOf.length === 0) throw new LifecycleError("any-of expiry must contain at least one boundary");
    const keys = expiry.anyOf.map((atom) => JSON.stringify(atom));
    if (new Set(keys).size !== keys.length) throw new LifecycleError("any-of expiry contains duplicate boundaries");
    expiry.anyOf.forEach(validateExpiryAtom);
    return;
  }
  validateExpiryAtom(expiry);
}

function sameExpiry(left: Expiry, right: Expiry): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function atomExpiresAt(expiry: ExpiryAtom, boundary: ExpiryBoundary): boolean {
  if (expiry.type !== boundary.type) return false;
  switch (expiry.type) {
    case "phase_end":
      return expiry.phaseInstanceId === (boundary as Extract<ExpiryBoundary, { type: "phase_end" }>).phaseInstanceId;
    case "turn_end":
      return expiry.turnId === (boundary as Extract<ExpiryBoundary, { type: "turn_end" }>).turnId;
    case "turn_start": {
      const candidate = boundary as Extract<ExpiryBoundary, { type: "turn_start" }>;
      return expiry.playerId === candidate.playerId && candidate.turnId > expiry.afterTurnId;
    }
    case "source_death":
      return expiry.sourcePlayerId === (boundary as Extract<ExpiryBoundary, { type: "source_death" }>).sourcePlayerId;
    case "owner_death":
      return expiry.ownerId === (boundary as Extract<ExpiryBoundary, { type: "owner_death" }>).ownerId;
    case "skill_lost": {
      const candidate = boundary as Extract<ExpiryBoundary, { type: "skill_lost" }>;
      return expiry.ownerId === candidate.ownerId && expiry.skillId === candidate.skillId;
    }
    case "game_end":
      return true;
  }
}

function expiresAt(expiry: Expiry, boundary: ExpiryBoundary): boolean {
  if (expiry.type === "permanent") return false;
  if (expiry.type === "any_of") return expiry.anyOf.some((atom) => atomExpiresAt(atom, boundary));
  return atomExpiresAt(expiry, boundary);
}

function cloneExpiry(expiry: Expiry): Expiry {
  return expiry.type === "any_of"
    ? { type: "any_of", anyOf: expiry.anyOf.map((atom) => ({ ...atom })) }
    : { ...expiry };
}

export function createSkillLifecycleState(): SkillLifecycleState {
  return {
    nextEffectId: 1,
    marks: [],
    effects: [],
    grants: [],
    suppressions: [],
    limitedUses: [],
    awakenings: [],
    skillLosses: [],
  };
}

export function addMark(
  state: SkillLifecycleState,
  input: Omit<MarkState, "value"> & { readonly amount: number },
): number {
  positive(input.amount, "mark amount");
  if (!input.markId || !input.ownerId || !input.sourceSkillId) throw new LifecycleError("mark metadata is incomplete");
  validateExpiry(input.expiry);
  const existing = state.marks.find((mark) =>
    mark.markId === input.markId &&
    mark.ownerId === input.ownerId &&
    mark.sourcePlayerId === input.sourcePlayerId &&
    mark.sourceSkillId === input.sourceSkillId &&
    mark.visibility === input.visibility &&
    sameExpiry(mark.expiry, input.expiry)
  );
  if (existing) {
    const nextValue = existing.value + input.amount;
    if (!Number.isSafeInteger(nextValue)) throw new LifecycleError("mark value overflow");
    existing.value = nextValue;
    return existing.value;
  }
  state.marks.push({
    markId: input.markId,
    ownerId: input.ownerId,
    sourcePlayerId: input.sourcePlayerId,
    sourceSkillId: input.sourceSkillId,
    value: input.amount,
    visibility: input.visibility,
    expiry: cloneExpiry(input.expiry),
  });
  return input.amount;
}

export function markCount(
  state: SkillLifecycleState,
  input: { readonly ownerId: PlayerId; readonly markId: string; readonly sourcePlayerId?: PlayerId | null; readonly sourceSkillId?: string },
): number {
  return state.marks
    .filter((mark) =>
      mark.ownerId === input.ownerId &&
      mark.markId === input.markId &&
      (input.sourcePlayerId === undefined || mark.sourcePlayerId === input.sourcePlayerId) &&
      (input.sourceSkillId === undefined || mark.sourceSkillId === input.sourceSkillId)
    )
    .reduce((sum, mark) => {
      const next = sum + mark.value;
      if (!Number.isSafeInteger(next)) throw new LifecycleError("mark count overflow");
      return next;
    }, 0);
}

/** Spends marks in stable insertion order while preserving source isolation metadata. */
export function spendMarks(
  state: SkillLifecycleState,
  input: {
    readonly ownerId: PlayerId;
    readonly markId: string;
    readonly amount: number;
    readonly sourcePlayerId?: PlayerId | null;
    readonly sourceSkillId?: string;
  },
): void {
  positive(input.amount, "mark spend amount");
  if (markCount(state, input) < input.amount) throw new LifecycleError("not enough marks");
  let remaining = input.amount;
  for (const mark of state.marks) {
    if (
      mark.ownerId !== input.ownerId || mark.markId !== input.markId ||
      (input.sourcePlayerId !== undefined && mark.sourcePlayerId !== input.sourcePlayerId) ||
      (input.sourceSkillId !== undefined && mark.sourceSkillId !== input.sourceSkillId)
    ) continue;
    const spent = Math.min(mark.value, remaining);
    mark.value -= spent;
    remaining -= spent;
    if (remaining === 0) break;
  }
  state.marks = state.marks.filter((mark) => mark.value > 0);
}

function allocateEffectId(state: SkillLifecycleState): number {
  positive(state.nextEffectId, "nextEffectId");
  if (state.nextEffectId >= Number.MAX_SAFE_INTEGER) throw new LifecycleError("lifecycle effect id exhausted");
  const id = state.nextEffectId;
  state.nextEffectId += 1;
  return id;
}

export function addStatusEffect(
  state: SkillLifecycleState,
  input: Omit<StatusEffect, "effectId">,
): StatusEffect {
  if (!input.ownerId || !input.kind || !input.sourceSkillId) throw new LifecycleError("status effect metadata is incomplete");
  validateExpiry(input.expiry);
  const effect: StatusEffect = {
    ...input,
    effectId: allocateEffectId(state),
    payload: { ...input.payload },
    expiry: cloneExpiry(input.expiry),
  };
  state.effects.push(effect);
  return effect;
}

export function grantSkill(
  state: SkillLifecycleState,
  input: Omit<SkillGrant, "grantId">,
): SkillGrant {
  if (!input.ownerId || !input.skillId || !input.sourceSkillId) throw new LifecycleError("skill grant metadata is incomplete");
  validateExpiry(input.expiry);
  if (state.grants.some((grant) =>
    grant.ownerId === input.ownerId && grant.skillId === input.skillId &&
    grant.sourcePlayerId === input.sourcePlayerId && grant.sourceSkillId === input.sourceSkillId &&
    sameExpiry(grant.expiry, input.expiry)
  )) throw new LifecycleError("duplicate skill grant");
  const grant: SkillGrant = { ...input, grantId: allocateEffectId(state), expiry: cloneExpiry(input.expiry) };
  state.grants.push(grant);
  return grant;
}

export function suppressSkills(
  state: SkillLifecycleState,
  input: Omit<SkillSuppression, "suppressionId">,
): SkillSuppression {
  if (!input.ownerId || !input.sourceSkillId) throw new LifecycleError("skill suppression metadata is incomplete");
  validateExpiry(input.expiry);
  const suppression: SkillSuppression = {
    ...input,
    suppressionId: allocateEffectId(state),
    expiry: cloneExpiry(input.expiry),
  };
  state.suppressions.push(suppression);
  return suppression;
}

export function effectiveSkillIds(
  state: SkillLifecycleState,
  ownerId: PlayerId,
  baseSkillIds: readonly string[],
): readonly string[] {
  const skills = new Set(baseSkillIds);
  for (const loss of state.skillLosses) {
    if (loss.ownerId !== ownerId) continue;
    for (const skillId of loss.skillIds) skills.delete(skillId);
  }
  for (const grant of state.grants) if (grant.ownerId === ownerId) skills.add(grant.skillId);
  for (const suppression of state.suppressions) {
    if (suppression.ownerId !== ownerId) continue;
    if (suppression.skillId === null) skills.clear();
    else skills.delete(suppression.skillId);
  }
  return Object.freeze([...skills]);
}

/** Records only the skills present at the loss event (for example 断肠). */
export function recordSkillLoss(
  state: SkillLifecycleState,
  input: Omit<SkillLossRecord, "lossId">,
): SkillLossRecord {
  positive(input.lostAtEventId, "skill-loss eventId");
  if (!input.ownerId || !input.sourceSkillId || input.skillIds.length === 0) {
    throw new LifecycleError("skill loss metadata is incomplete");
  }
  if (input.skillIds.some((skillId) => !skillId) || new Set(input.skillIds).size !== input.skillIds.length) {
    throw new LifecycleError("skill loss must contain unique nonempty skill ids");
  }
  const record: SkillLossRecord = {
    ...input,
    lossId: allocateEffectId(state),
    skillIds: Object.freeze([...input.skillIds]),
  };
  // Grants already present at this event are among the lost skill instances;
  // a grant created later is intentionally unaffected by this snapshot record.
  const lost = new Set(input.skillIds);
  state.grants = state.grants.filter((grant) => grant.ownerId !== input.ownerId || !lost.has(grant.skillId));
  state.skillLosses.push(record);
  return record;
}

export function consumeLimitedSkill(
  state: SkillLifecycleState,
  ownerId: PlayerId,
  skillId: string,
  eventId: number,
): void {
  positive(eventId, "limited-skill eventId");
  if (!ownerId || !skillId) throw new LifecycleError("limited skill metadata is incomplete");
  if (state.limitedUses.some((entry) => entry.ownerId === ownerId && entry.skillId === skillId)) {
    throw new LifecycleError("limited skill was already consumed");
  }
  state.limitedUses.push({ ownerId, skillId, consumedAtEventId: eventId });
}

export function awakenSkill(
  state: SkillLifecycleState,
  ownerId: PlayerId,
  skillId: string,
  eventId: number,
): void {
  positive(eventId, "awakening eventId");
  if (!ownerId || !skillId) throw new LifecycleError("awakening metadata is incomplete");
  if (state.awakenings.some((entry) => entry.ownerId === ownerId && entry.skillId === skillId)) {
    throw new LifecycleError("skill already awakened");
  }
  state.awakenings.push({ ownerId, skillId, awakenedAtEventId: eventId });
}

export function hasAwakened(state: SkillLifecycleState, ownerId: PlayerId, skillId: string): boolean {
  return state.awakenings.some((entry) => entry.ownerId === ownerId && entry.skillId === skillId);
}

export function setMaximumHp(player: LifePlayerState, maxHp: number): void {
  positive(maxHp, "maximum HP");
  player.maxHp = maxHp;
  if (player.hp > maxHp) player.hp = maxHp;
}

export function expireLifecycleState(state: SkillLifecycleState, boundary: ExpiryBoundary): {
  readonly marks: readonly MarkState[];
  readonly effects: readonly StatusEffect[];
  readonly grants: readonly SkillGrant[];
  readonly suppressions: readonly SkillSuppression[];
} {
  const marks = state.marks.filter((entry) => expiresAt(entry.expiry, boundary));
  const effects = state.effects.filter((entry) => expiresAt(entry.expiry, boundary));
  const grants = state.grants.filter((entry) => expiresAt(entry.expiry, boundary));
  const suppressions = state.suppressions.filter((entry) => expiresAt(entry.expiry, boundary));
  state.marks = state.marks.filter((entry) => !expiresAt(entry.expiry, boundary));
  state.effects = state.effects.filter((entry) => !expiresAt(entry.expiry, boundary));
  state.grants = state.grants.filter((entry) => !expiresAt(entry.expiry, boundary));
  state.suppressions = state.suppressions.filter((entry) => !expiresAt(entry.expiry, boundary));
  return {
    marks: Object.freeze(marks),
    effects: Object.freeze(effects),
    grants: Object.freeze(grants),
    suppressions: Object.freeze(suppressions),
  };
}

export function cloneSkillLifecycleState(state: SkillLifecycleState): SkillLifecycleState {
  return {
    nextEffectId: state.nextEffectId,
    marks: state.marks.map((mark) => ({ ...mark, expiry: cloneExpiry(mark.expiry) })),
    effects: state.effects.map((effect) => ({ ...effect, payload: { ...effect.payload }, expiry: cloneExpiry(effect.expiry) })),
    grants: state.grants.map((grant) => ({ ...grant, expiry: cloneExpiry(grant.expiry) })),
    suppressions: state.suppressions.map((suppression) => ({ ...suppression, expiry: cloneExpiry(suppression.expiry) })),
    limitedUses: state.limitedUses.map((entry) => ({ ...entry })),
    awakenings: state.awakenings.map((entry) => ({ ...entry })),
    skillLosses: (state.skillLosses ?? []).map((entry) => ({ ...entry, skillIds: [...entry.skillIds] })),
  };
}

export function assertSkillLifecycleState(state: SkillLifecycleState): void {
  positive(state.nextEffectId, "nextEffectId");
  if (!Array.isArray(state.skillLosses)) throw new LifecycleError("skill loss history is missing");
  const allocatedIds = [...state.effects.map((entry) => entry.effectId), ...state.grants.map((entry) => entry.grantId), ...state.suppressions.map((entry) => entry.suppressionId), ...state.skillLosses.map((entry) => entry.lossId)];
  if (new Set(allocatedIds).size !== allocatedIds.length || allocatedIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id >= state.nextEffectId)) {
    throw new LifecycleError("allocated lifecycle ids are invalid or duplicated");
  }
  for (const mark of state.marks) {
    if (!mark.markId || !mark.ownerId || !mark.sourceSkillId) throw new LifecycleError("mark metadata is incomplete");
    positive(mark.value, "mark value");
    validateExpiry(mark.expiry);
  }
  for (const entry of [...state.effects, ...state.grants, ...state.suppressions]) validateExpiry(entry.expiry);
  for (const loss of state.skillLosses) {
    positive(loss.lossId, "skill loss id");
    positive(loss.lostAtEventId, "skill loss eventId");
    if (!loss.ownerId || !loss.sourceSkillId || loss.skillIds.length === 0 || new Set(loss.skillIds).size !== loss.skillIds.length || loss.skillIds.some((id) => !id)) {
      throw new LifecycleError("skill loss metadata is invalid");
    }
  }
  const limitedKeys = state.limitedUses.map((entry) => `${entry.ownerId}:${entry.skillId}`);
  const awakeningKeys = state.awakenings.map((entry) => `${entry.ownerId}:${entry.skillId}`);
  if (new Set(limitedKeys).size !== limitedKeys.length) throw new LifecycleError("limited skill use is duplicated");
  if (new Set(awakeningKeys).size !== awakeningKeys.length) throw new LifecycleError("awakening is duplicated");
  for (const entry of [...state.limitedUses.map((value) => ({ eventId: value.consumedAtEventId, ...value })), ...state.awakenings.map((value) => ({ eventId: value.awakenedAtEventId, ...value }))]) {
    if (!entry.ownerId || !entry.skillId) throw new LifecycleError("skill lifecycle key is incomplete");
    positive(entry.eventId, "skill lifecycle eventId");
  }
}
