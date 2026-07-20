import type { CardId, DamageNature, PlayerId } from "../types.js";

export const DAMAGE_STAGES = [
  "start",
  "causing",
  "receiving",
  "ready_for_life_deduction",
  "life_deducted",
  "source_after_once",
  "source_after_per_point",
  "target_after_once",
  "target_after_per_point",
  "settlement_end",
  "complete",
] as const;

export type DamageStage = (typeof DAMAGE_STAGES)[number];

export type LegacyDamageStage =
  | "created"
  | "redirecting"
  | "modifying"
  | "ready"
  | "life_applied"
  | "after_damage"
  | "complete"
  | "prevented";

export interface DamageTriggerProgress {
  sourceOnceCompleted: boolean;
  sourcePointCursor: number;
  targetOnceCompleted: boolean;
  targetPointCursor: number;
  settlementEndCompleted: boolean;
}

export type DamageTriggerWindowKind =
  | "source_after_once"
  | "source_after_per_point"
  | "target_after_once"
  | "target_after_per_point"
  | "settlement_end";

export interface DamageTriggerWindow {
  readonly kind: DamageTriggerWindowKind;
  readonly eventType: "damage_dealt" | "damage_received" | "damage_completed";
  readonly cadence: "once" | "per_point" | "settlement";
  readonly subjectId: PlayerId | null;
  readonly pointIndex: number | null;
  readonly totalPoints: number;
  /** Dead owners are excluded; living source and third-party/global owners remain. */
  readonly eligibleOwnerIds: readonly PlayerId[];
}

export interface DamageReason {
  readonly type: "card" | "skill" | "chain" | "rule";
  readonly id: string;
}

const DAMAGE_REASON_TYPES = new Set<DamageReason["type"]>(["card", "skill", "chain", "rule"]);

export interface DamageModifierRecord {
  readonly sourceId: PlayerId | null;
  readonly skillId: string | null;
  readonly operation: "add" | "set" | "cap";
  readonly value: number;
  readonly amountBefore: number;
  readonly amountAfter: number;
}

export interface DamageRedirectRecord {
  readonly sourceId: PlayerId | null;
  readonly skillId: string;
  readonly fromTargetId: PlayerId;
  readonly toTargetId: PlayerId;
}

export interface DamagePreventionRecord {
  readonly sourceId: PlayerId | null;
  readonly skillId: string | null;
  readonly reason: string;
}

export interface DamageInstance {
  readonly version: 2;
  readonly type: "damage";
  readonly damageId: number;
  readonly frameId: number;
  readonly sourceId: PlayerId | null;
  targetId: PlayerId;
  readonly originalTargetId: PlayerId;
  readonly cardUseId: number | null;
  readonly physicalCardIds: readonly CardId[];
  readonly nature: DamageNature;
  readonly reason: DamageReason;
  readonly originalAmount: number;
  amount: number;
  stage: DamageStage;
  readonly modifiers: DamageModifierRecord[];
  readonly redirects: DamageRedirectRecord[];
  prevention: DamagePreventionRecord | null;
  hpBefore: number | null;
  hpAfter: number | null;
  triggerProgress: DamageTriggerProgress;
}

/** Serialized v1 shape accepted only through migrateDamageInstance(). */
export type LegacyDamageInstanceV1 = Omit<DamageInstance, "version" | "stage" | "triggerProgress"> & {
  stage: LegacyDamageStage;
  completedTriggerPoints: number;
};

export interface LifePlayerState {
  readonly id: PlayerId;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface DamageApplicationResult {
  readonly damageId: number;
  readonly targetId: PlayerId;
  readonly amount: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly entersDying: boolean;
}

export interface HpLossEvent {
  readonly type: "hp_loss";
  readonly eventId: number;
  readonly targetId: PlayerId;
  readonly amount: number;
  readonly reason: string;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly entersDying: boolean;
}

export interface RecoveryEvent {
  readonly type: "recovery";
  readonly eventId: number;
  readonly sourceId: PlayerId | null;
  readonly targetId: PlayerId;
  readonly requestedAmount: number;
  readonly recoveredAmount: number;
  readonly reason: string;
  readonly hpBefore: number;
  readonly hpAfter: number;
}

export class DamageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DamageError";
  }
}

const DAMAGE_STAGE_SET = new Set<string>(DAMAGE_STAGES);

function createTriggerProgress(): DamageTriggerProgress {
  return {
    sourceOnceCompleted: false,
    sourcePointCursor: 0,
    targetOnceCompleted: false,
    targetPointCursor: 0,
    settlementEndCompleted: false,
  };
}

function markSkippedPostDamageWindows(damage: DamageInstance): void {
  damage.triggerProgress.sourceOnceCompleted = true;
  damage.triggerProgress.sourcePointCursor = damage.amount;
  damage.triggerProgress.targetOnceCompleted = true;
  damage.triggerProgress.targetPointCursor = damage.amount;
}

function positiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DamageError(`${label} must be a positive integer`);
}

function playerFor(players: readonly LifePlayerState[], playerId: PlayerId): LifePlayerState {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) throw new DamageError(`unknown player: ${playerId}`);
  return player;
}

function assertLivingTarget(player: LifePlayerState): void {
  if (!player.alive) throw new DamageError(`${player.id} is dead`);
  if (!Number.isSafeInteger(player.hp) || !Number.isSafeInteger(player.maxHp) || player.maxHp <= 0 || player.hp > player.maxHp) {
    throw new DamageError(`${player.id} has invalid life state`);
  }
}

export function createDamageInstance(input: {
  readonly damageId: number;
  readonly frameId: number;
  readonly sourceId: PlayerId | null;
  readonly targetId: PlayerId;
  readonly cardUseId?: number | null;
  readonly physicalCardIds?: readonly CardId[];
  readonly nature: DamageNature;
  readonly reason: DamageReason;
  readonly amount: number;
}): DamageInstance {
  positiveSafeInteger(input.damageId, "damageId");
  positiveSafeInteger(input.frameId, "frameId");
  positiveSafeInteger(input.amount, "damage amount");
  if (!input.targetId || !input.reason.id) throw new DamageError("damage target and reason are required");
  const cardIds = [...(input.physicalCardIds ?? [])];
  if (new Set(cardIds).size !== cardIds.length) throw new DamageError("damage card ids must be unique");
  if (input.cardUseId !== undefined && input.cardUseId !== null) positiveSafeInteger(input.cardUseId, "cardUseId");
  return {
    version: 2,
    type: "damage",
    damageId: input.damageId,
    frameId: input.frameId,
    sourceId: input.sourceId,
    targetId: input.targetId,
    originalTargetId: input.targetId,
    cardUseId: input.cardUseId ?? null,
    physicalCardIds: Object.freeze(cardIds),
    nature: input.nature,
    reason: { ...input.reason },
    originalAmount: input.amount,
    amount: input.amount,
    stage: "start",
    modifiers: [],
    redirects: [],
    prevention: null,
    hpBefore: null,
    hpAfter: null,
    triggerProgress: createTriggerProgress(),
  };
}

/** Enters the source-side "causing damage" timing from damage start. */
export function beginDamageCausing(damage: DamageInstance): void {
  if (damage.stage !== "start") throw new DamageError("damage causing window cannot start now");
  damage.stage = "causing";
}

/** Enters the target-side "receiving damage" timing after source effects finish. */
export function beginDamageReceiving(damage: DamageInstance): void {
  if (damage.stage !== "causing") throw new DamageError("damage receiving window cannot start now");
  damage.stage = "receiving";
}

/** @deprecated Compatibility entry point; new controllers should use both explicit timing functions. */
export function beginDamageRedirects(damage: DamageInstance): void {
  if (damage.stage === "start") beginDamageCausing(damage);
  if (damage.stage === "causing") beginDamageReceiving(damage);
  else if (damage.stage !== "receiving") throw new DamageError("damage redirect window cannot start now");
}

export function redirectDamage(
  damage: DamageInstance,
  input: { readonly toTargetId: PlayerId; readonly sourceId?: PlayerId | null; readonly skillId: string },
): void {
  if (damage.stage !== "receiving") throw new DamageError("damage is not accepting redirects");
  if (!input.toTargetId || !input.skillId) throw new DamageError("redirect target and skill are required");
  const visited = new Set([damage.originalTargetId, ...damage.redirects.map((entry) => entry.toTargetId)]);
  if (input.toTargetId === damage.targetId || visited.has(input.toTargetId)) {
    throw new DamageError("damage redirect would create a cycle");
  }
  const fromTargetId = damage.targetId;
  damage.targetId = input.toTargetId;
  damage.redirects.push({
    sourceId: input.sourceId ?? null,
    skillId: input.skillId,
    fromTargetId,
    toTargetId: input.toTargetId,
  });
}

export function beginDamageModifiers(damage: DamageInstance): void {
  if (damage.stage === "start") beginDamageCausing(damage);
  if (damage.stage === "causing") beginDamageReceiving(damage);
  else if (damage.stage !== "receiving") throw new DamageError("damage modifier window cannot start now");
}

export function modifyDamage(
  damage: DamageInstance,
  input: {
    readonly operation: "add" | "set" | "cap";
    readonly value: number;
    readonly sourceId?: PlayerId | null;
    readonly skillId?: string | null;
  },
): void {
  if (damage.stage !== "causing" && damage.stage !== "receiving") {
    throw new DamageError("damage is not accepting modifiers");
  }
  if (!Number.isSafeInteger(input.value)) throw new DamageError("damage modifier value must be an integer");
  const before = damage.amount;
  let after: number;
  if (input.operation === "add") after = before + input.value;
  else if (input.operation === "set") after = input.value;
  else after = Math.min(before, input.value);
  if (!Number.isSafeInteger(after) || after < 0) throw new DamageError("damage modifier produced an invalid amount");
  damage.amount = after;
  damage.modifiers.push({
    sourceId: input.sourceId ?? null,
    skillId: input.skillId ?? null,
    operation: input.operation,
    value: input.value,
    amountBefore: before,
    amountAfter: after,
  });
}

export function preventDamage(
  damage: DamageInstance,
  input: { readonly sourceId?: PlayerId | null; readonly skillId?: string | null; readonly reason: string },
): void {
  if (damage.stage !== "causing" && damage.stage !== "receiving" && damage.stage !== "ready_for_life_deduction") {
    throw new DamageError("damage cannot be prevented at this stage");
  }
  if (!input.reason) throw new DamageError("damage prevention reason is required");
  damage.amount = 0;
  damage.prevention = {
    sourceId: input.sourceId ?? null,
    skillId: input.skillId ?? null,
    reason: input.reason,
  };
  markSkippedPostDamageWindows(damage);
  damage.stage = "settlement_end";
}

export function lockDamageAmount(damage: DamageInstance): number {
  if (damage.stage === "start" || damage.stage === "causing") beginDamageModifiers(damage);
  if (damage.stage !== "receiving") throw new DamageError("damage amount cannot be locked at this stage");
  if (damage.amount <= 0) {
    damage.amount = 0;
    damage.prevention ??= { sourceId: null, skillId: null, reason: "damage amount reduced to zero" };
    markSkippedPostDamageWindows(damage);
    damage.stage = "settlement_end";
    return 0;
  }
  damage.stage = "ready_for_life_deduction";
  return damage.amount;
}

/** Applies the full amount once; dying resolution must finish before after-damage triggers. */
export function applyDamageToLife(
  players: readonly LifePlayerState[],
  damage: DamageInstance,
): DamageApplicationResult {
  if (damage.stage !== "ready_for_life_deduction") throw new DamageError("damage is not ready to apply");
  const target = playerFor(players, damage.targetId);
  assertLivingTarget(target);
  const before = target.hp;
  target.hp -= damage.amount;
  damage.hpBefore = before;
  damage.hpAfter = target.hp;
  damage.stage = "life_deducted";
  return {
    damageId: damage.damageId,
    targetId: target.id,
    amount: damage.amount,
    hpBefore: before,
    hpAfter: target.hp,
    entersDying: target.hp <= 0,
  };
}

function enterPostDamageTiming(damage: DamageInstance): void {
  if (damage.stage !== "life_deducted") throw new DamageError("damage is not waiting for dying resolution");
  // Dying/death is an inserted resolution. Once it finishes, the original
  // damage event must resume even when the target died so source/global
  // after-damage and damage-completed triggers still receive their windows.
  if (damage.sourceId === null) {
    damage.triggerProgress.sourceOnceCompleted = true;
    damage.triggerProgress.sourcePointCursor = damage.amount;
    damage.stage = "target_after_once";
  } else {
    damage.stage = "source_after_once";
  }
}

/** Called only after any ordinary dying frame has rescued the target or confirmed death. */
export function resumeDamageAfterDying(
  players: readonly LifePlayerState[],
  damage: DamageInstance,
): void {
  if (damage.stage !== "life_deducted") throw new DamageError("damage is not waiting for dying resolution");
  const target = playerFor(players, damage.targetId);
  if (target.alive && target.hp <= 0) throw new DamageError("living damage target still requires dying resolution");
  enterPostDamageTiming(damage);
}

export interface ProtectedDamageResumeInput {
  readonly skillId: "buqu";
  readonly targetId: PlayerId;
}

/**
 * Low-level escape hatch for a verified Buqu dying frame. Proof validation is
 * deliberately owned by damage-flow; this function only enforces its narrow
 * life-state and target boundary before entering the shared post-damage path.
 */
export function resumeDamageAfterProtectedDying(
  players: readonly LifePlayerState[],
  damage: DamageInstance,
  input: ProtectedDamageResumeInput,
): void {
  if (damage.stage !== "life_deducted") throw new DamageError("damage is not waiting for dying resolution");
  if (input.skillId !== "buqu") throw new DamageError("only Buqu may protect a nonpositive-HP damage target");
  if (input.targetId !== damage.targetId) throw new DamageError("protected resume target does not match damage target");
  const target = playerFor(players, input.targetId);
  assertLivingTarget(target);
  if (target.hp > 0) throw new DamageError("protected resume requires a nonpositive-HP target");
  enterPostDamageTiming(damage);
}

/** Returns the exact persisted post-damage window without advancing it. */
export function currentDamageTriggerWindow(
  players: readonly LifePlayerState[],
  damage: DamageInstance,
): DamageTriggerWindow | null {
  const eligibleOwnerIds = Object.freeze(players.filter((player) => player.alive).map((player) => player.id));
  const common = { totalPoints: damage.amount, eligibleOwnerIds };
  switch (damage.stage) {
    case "source_after_once":
      return { ...common, kind: damage.stage, eventType: "damage_dealt", cadence: "once", subjectId: damage.sourceId, pointIndex: null };
    case "source_after_per_point":
      return {
        ...common,
        kind: damage.stage,
        eventType: "damage_dealt",
        cadence: "per_point",
        subjectId: damage.sourceId,
        pointIndex: damage.triggerProgress.sourcePointCursor + 1,
      };
    case "target_after_once":
      return { ...common, kind: damage.stage, eventType: "damage_received", cadence: "once", subjectId: damage.targetId, pointIndex: null };
    case "target_after_per_point":
      return {
        ...common,
        kind: damage.stage,
        eventType: "damage_received",
        cadence: "per_point",
        subjectId: damage.targetId,
        pointIndex: damage.triggerProgress.targetPointCursor + 1,
      };
    case "settlement_end":
      return { ...common, kind: damage.stage, eventType: "damage_completed", cadence: "settlement", subjectId: damage.targetId, pointIndex: null };
    default:
      return null;
  }
}

/** Marks only the current window complete and advances to the next exact timing. */
export function completeDamageTriggerWindow(damage: DamageInstance): void {
  const progress = damage.triggerProgress;
  switch (damage.stage) {
    case "source_after_once":
      progress.sourceOnceCompleted = true;
      damage.stage = "source_after_per_point";
      return;
    case "source_after_per_point":
      if (progress.sourcePointCursor >= damage.amount) throw new DamageError("source per-point window is already exhausted");
      progress.sourcePointCursor += 1;
      damage.stage = progress.sourcePointCursor === damage.amount ? "target_after_once" : "source_after_per_point";
      return;
    case "target_after_once":
      progress.targetOnceCompleted = true;
      damage.stage = "target_after_per_point";
      return;
    case "target_after_per_point":
      if (progress.targetPointCursor >= damage.amount) throw new DamageError("target per-point window is already exhausted");
      progress.targetPointCursor += 1;
      damage.stage = progress.targetPointCursor === damage.amount ? "settlement_end" : "target_after_per_point";
      return;
    case "settlement_end":
      progress.settlementEndCompleted = true;
      damage.stage = "complete";
      return;
    default:
      throw new DamageError("damage has no completable trigger window at this stage");
  }
}

/** @deprecated Use currentDamageTriggerWindow plus completeDamageTriggerWindow. */
export function consumeDamageTriggerPoint(damage: DamageInstance): number | null {
  if (damage.stage === "settlement_end") return null;
  if (damage.stage === "complete") throw new DamageError("damage trigger windows are already complete");
  if (damage.stage !== "source_after_per_point" && damage.stage !== "target_after_per_point") {
    throw new DamageError("complete the once-per-damage window before consuming per-point triggers");
  }
  const point = damage.stage === "source_after_per_point"
    ? damage.triggerProgress.sourcePointCursor + 1
    : damage.triggerProgress.targetPointCursor + 1;
  completeDamageTriggerWindow(damage);
  return point;
}

export function finishDamage(damage: DamageInstance): void {
  if (damage.stage !== "settlement_end") throw new DamageError("damage cannot finish before its settlement-end window");
  completeDamageTriggerWindow(damage);
}

/** Loss of HP is intentionally separate and never produces damage trigger slots. */
export function loseHp(
  players: readonly LifePlayerState[],
  input: { readonly eventId: number; readonly targetId: PlayerId; readonly amount: number; readonly reason: string },
): HpLossEvent {
  positiveSafeInteger(input.eventId, "eventId");
  positiveSafeInteger(input.amount, "HP loss amount");
  if (!input.reason) throw new DamageError("HP loss reason is required");
  const target = playerFor(players, input.targetId);
  assertLivingTarget(target);
  const before = target.hp;
  target.hp -= input.amount;
  return {
    type: "hp_loss",
    eventId: input.eventId,
    targetId: target.id,
    amount: input.amount,
    reason: input.reason,
    hpBefore: before,
    hpAfter: target.hp,
    entersDying: target.hp <= 0,
  };
}

export function recoverHp(
  players: readonly LifePlayerState[],
  input: {
    readonly eventId: number;
    readonly sourceId: PlayerId | null;
    readonly targetId: PlayerId;
    readonly amount: number;
    readonly reason: string;
  },
): RecoveryEvent {
  positiveSafeInteger(input.eventId, "eventId");
  positiveSafeInteger(input.amount, "recovery amount");
  if (!input.reason) throw new DamageError("recovery reason is required");
  const target = playerFor(players, input.targetId);
  if (!target.alive) throw new DamageError("dead players cannot recover HP");
  if (target.hp > target.maxHp) throw new DamageError("target HP exceeds max HP");
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + input.amount);
  return {
    type: "recovery",
    eventId: input.eventId,
    sourceId: input.sourceId,
    targetId: target.id,
    requestedAmount: input.amount,
    recoveredAmount: target.hp - before,
    reason: input.reason,
    hpBefore: before,
    hpAfter: target.hp,
  };
}

export function cloneDamageInstance(damage: DamageInstance): DamageInstance {
  return {
    ...damage,
    physicalCardIds: Object.freeze([...damage.physicalCardIds]),
    reason: { ...damage.reason },
    modifiers: damage.modifiers.map((modifier) => ({ ...modifier })),
    redirects: damage.redirects.map((redirect) => ({ ...redirect })),
    prevention: damage.prevention ? { ...damage.prevention } : null,
    triggerProgress: { ...damage.triggerProgress },
  };
}

/**
 * Converts v1 snapshots at unambiguous boundaries. A partially consumed
 * combined `after_damage` cursor is rejected because it cannot be split into
 * independent source/target windows without either replaying or skipping one.
 */
export function migrateDamageInstance(snapshot: DamageInstance | LegacyDamageInstanceV1): DamageInstance {
  if ((snapshot as { version?: unknown }).version === 2) {
    const cloned = cloneDamageInstance(snapshot as DamageInstance);
    assertDamageInstance(cloned);
    return cloned;
  }
  if ((snapshot as { version?: unknown }).version !== undefined) throw new DamageError("unsupported damage snapshot version");
  const legacy = snapshot as LegacyDamageInstanceV1;
  if (legacy.type !== "damage") throw new DamageError("legacy damage snapshot has the wrong type");
  if (!Number.isSafeInteger(legacy.completedTriggerPoints) || legacy.completedTriggerPoints < 0 || legacy.completedTriggerPoints > legacy.amount) {
    throw new DamageError("legacy damage trigger progress is invalid");
  }
  if (legacy.stage !== "after_damage" && legacy.stage !== "complete" && legacy.completedTriggerPoints !== 0) {
    throw new DamageError("legacy damage snapshot has trigger progress before its post-damage stage");
  }
  if (legacy.stage === "complete") {
    const expectedCompletedPoints = legacy.prevention === null ? legacy.amount : 0;
    if (legacy.completedTriggerPoints !== expectedCompletedPoints) {
      throw new DamageError("legacy completed damage has unresolved trigger progress");
    }
  }

  const progress = createTriggerProgress();
  let stage: DamageStage;
  switch (legacy.stage) {
    case "created":
      stage = "start";
      break;
    case "redirecting":
    case "modifying":
      stage = "receiving";
      break;
    case "ready":
      stage = "ready_for_life_deduction";
      break;
    case "life_applied":
      stage = "life_deducted";
      break;
    case "prevented":
      stage = "settlement_end";
      progress.sourceOnceCompleted = true;
      progress.sourcePointCursor = legacy.amount;
      progress.targetOnceCompleted = true;
      progress.targetPointCursor = legacy.amount;
      break;
    case "after_damage": {
      const cursor = legacy.completedTriggerPoints;
      if (cursor > 0 && cursor < legacy.amount) {
        throw new DamageError("partially consumed legacy after-damage cursor cannot be split without replay ambiguity");
      }
      if (cursor === legacy.amount) {
        progress.sourceOnceCompleted = true;
        progress.sourcePointCursor = legacy.amount;
        progress.targetOnceCompleted = true;
        progress.targetPointCursor = legacy.amount;
        stage = "settlement_end";
      } else if (legacy.sourceId !== null) {
        stage = "source_after_once";
      } else {
        progress.sourceOnceCompleted = true;
        progress.sourcePointCursor = legacy.amount;
        stage = "target_after_once";
      }
      break;
    }
    case "complete":
      stage = "complete";
      progress.sourceOnceCompleted = true;
      progress.sourcePointCursor = legacy.amount;
      progress.targetOnceCompleted = true;
      progress.targetPointCursor = legacy.amount;
      progress.settlementEndCompleted = true;
      break;
    default:
      throw new DamageError("legacy damage snapshot has an unknown stage");
  }

  const { completedTriggerPoints: _completedTriggerPoints, stage: _legacyStage, ...base } = legacy;
  const migrated: DamageInstance = {
    ...base,
    version: 2,
    stage,
    physicalCardIds: Object.freeze([...legacy.physicalCardIds]),
    reason: { ...legacy.reason },
    modifiers: legacy.modifiers.map((modifier) => ({ ...modifier })),
    redirects: legacy.redirects.map((redirect) => ({ ...redirect })),
    prevention: legacy.prevention ? { ...legacy.prevention } : null,
    triggerProgress: progress,
  };
  assertDamageInstance(migrated);
  return migrated;
}

export function assertDamageInstance(damage: DamageInstance): void {
  if ((damage as { version?: unknown }).version !== 2) {
    throw new DamageError("legacy damage snapshot requires migrateDamageInstance");
  }
  if (!DAMAGE_STAGE_SET.has(damage.stage)) throw new DamageError("damage stage is invalid");
  positiveSafeInteger(damage.damageId, "damageId");
  positiveSafeInteger(damage.frameId, "frameId");
  positiveSafeInteger(damage.originalAmount, "original damage amount");
  if (!Number.isSafeInteger(damage.amount) || damage.amount < 0) throw new DamageError("damage amount is invalid");
  if (!damage.targetId || !damage.originalTargetId || !damage.reason.id ||
      !DAMAGE_REASON_TYPES.has(damage.reason.type)) {
    throw new DamageError("damage metadata is incomplete");
  }
  if (new Set(damage.physicalCardIds).size !== damage.physicalCardIds.length) throw new DamageError("damage card ids are duplicated");
  const progress = damage.triggerProgress;
  if (!progress ||
    typeof progress.sourceOnceCompleted !== "boolean" ||
    typeof progress.targetOnceCompleted !== "boolean" ||
    typeof progress.settlementEndCompleted !== "boolean" ||
    !Number.isSafeInteger(progress.sourcePointCursor) || progress.sourcePointCursor < 0 || progress.sourcePointCursor > damage.amount ||
    !Number.isSafeInteger(progress.targetPointCursor) || progress.targetPointCursor < 0 || progress.targetPointCursor > damage.amount) {
    throw new DamageError("damage trigger progress is invalid");
  }
  const appliedStage = damage.stage === "life_deducted" ||
    damage.stage === "source_after_once" || damage.stage === "source_after_per_point" ||
    damage.stage === "target_after_once" || damage.stage === "target_after_per_point" ||
    ((damage.stage === "settlement_end" || damage.stage === "complete") && damage.prevention === null);
  if (appliedStage) {
    if (damage.hpBefore === null || damage.hpAfter === null || damage.hpBefore - damage.hpAfter !== damage.amount) {
      throw new DamageError("applied damage HP snapshot is inconsistent");
    }
  }
  if (damage.prevention !== null && (damage.amount !== 0 || damage.hpBefore !== null || damage.hpAfter !== null || (damage.stage !== "settlement_end" && damage.stage !== "complete"))) {
    throw new DamageError("prevented damage metadata is inconsistent");
  }
  if (!appliedStage && damage.prevention === null && (damage.hpBefore !== null || damage.hpAfter !== null)) {
    throw new DamageError("unapplied damage contains an HP snapshot");
  }

  let replayAmount = damage.originalAmount;
  for (const modifier of damage.modifiers) {
    if ((modifier.operation !== "add" && modifier.operation !== "set" && modifier.operation !== "cap") ||
      modifier.amountBefore !== replayAmount || !Number.isSafeInteger(modifier.value)) {
      throw new DamageError("damage modifier history is inconsistent");
    }
    const replayAfter = modifier.operation === "add"
      ? replayAmount + modifier.value
      : modifier.operation === "set"
        ? modifier.value
        : Math.min(replayAmount, modifier.value);
    if (!Number.isSafeInteger(replayAfter) || replayAfter < 0 || modifier.amountAfter !== replayAfter) {
      throw new DamageError("damage modifier history is inconsistent");
    }
    replayAmount = replayAfter;
  }
  if (damage.prevention === null && replayAmount !== damage.amount) throw new DamageError("damage amount does not match modifier history");

  let redirectTarget = damage.originalTargetId;
  for (const redirect of damage.redirects) {
    if (!redirect.skillId || !redirect.toTargetId || redirect.fromTargetId !== redirectTarget) {
      throw new DamageError("damage redirect history is inconsistent");
    }
    redirectTarget = redirect.toTargetId;
  }
  const targets = [damage.originalTargetId, ...damage.redirects.map((entry) => entry.toTargetId)];
  if (new Set(targets).size !== targets.length || targets.at(-1) !== damage.targetId) {
    throw new DamageError("damage redirect history is inconsistent");
  }

  const requireProgress = (expected: Partial<DamageTriggerProgress>): void => {
    for (const [key, value] of Object.entries(expected) as [keyof DamageTriggerProgress, boolean | number][]) {
      if (progress[key] !== value) throw new DamageError(`damage trigger progress does not match stage ${damage.stage}`);
    }
  };
  const initial = {
    sourceOnceCompleted: false,
    sourcePointCursor: 0,
    targetOnceCompleted: false,
    targetPointCursor: 0,
    settlementEndCompleted: false,
  };
  switch (damage.stage) {
    case "start":
    case "causing":
    case "receiving":
    case "ready_for_life_deduction":
    case "life_deducted":
    case "source_after_once":
      requireProgress(initial);
      if (damage.stage === "source_after_once" && damage.sourceId === null) throw new DamageError("source-less damage has a source trigger window");
      break;
    case "source_after_per_point":
      requireProgress({ sourceOnceCompleted: true, targetOnceCompleted: false, targetPointCursor: 0, settlementEndCompleted: false });
      if (damage.sourceId === null || progress.sourcePointCursor >= damage.amount) throw new DamageError("source per-point cursor is inconsistent");
      break;
    case "target_after_once":
      requireProgress({ sourceOnceCompleted: true, sourcePointCursor: damage.amount, targetOnceCompleted: false, targetPointCursor: 0, settlementEndCompleted: false });
      break;
    case "target_after_per_point":
      requireProgress({ sourceOnceCompleted: true, sourcePointCursor: damage.amount, targetOnceCompleted: true, settlementEndCompleted: false });
      if (progress.targetPointCursor >= damage.amount) throw new DamageError("target per-point cursor is inconsistent");
      break;
    case "settlement_end":
      requireProgress({
        sourceOnceCompleted: true,
        sourcePointCursor: damage.amount,
        targetOnceCompleted: true,
        targetPointCursor: damage.amount,
        settlementEndCompleted: false,
      });
      break;
    case "complete":
      requireProgress({
        sourceOnceCompleted: true,
        sourcePointCursor: damage.amount,
        targetOnceCompleted: true,
        targetPointCursor: damage.amount,
        settlementEndCompleted: true,
      });
      break;
  }
}
