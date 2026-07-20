import {
  COMPLETE_RULE_SET_VERSION,
  DEFAULT_COMPLETE_RULE_CONFIG,
  enabledGeneralPacks,
  type RoomRuleConfig,
  type RuleSetVersion,
} from "../rule-config.js";
import {
  assertSkillLifecycleState,
  cloneSkillLifecycleState,
  createSkillLifecycleState,
  type SkillLifecycleState,
} from "./lifecycle.js";
import {
  assertResolutionStack,
  cloneResolutionStack,
  createResolutionStack,
  type ResolutionStack,
} from "./resolution.js";
import {
  assertDamageFlowState,
  cloneDamageFlowState,
  createDamageFlowState,
  type DamageFlowState,
} from "./damage-flow.js";
import type { LifePlayerState } from "./damage.js";
import {
  assertDyingStack,
  cloneDyingStack,
  createDyingStack,
  type DyingStack,
} from "./dying.js";
import {
  assertDeathStack,
  cloneDeathStack,
  createDeathStack,
  type DeathStack,
} from "./death.js";

export interface CompleteRulesEngineState {
  readonly version: 1;
  readonly ruleSetVersion: RuleSetVersion;
  ruleConfig: RoomRuleConfig;
  resolution: ResolutionStack;
  lifecycle: SkillLifecycleState;
  /** Persisted live damage-flow state. */
  damageFlow: DamageFlowState;
  /** Persisted live dying-stack state. */
  dying: DyingStack;
  /** Persisted live death-stack state. */
  death: DeathStack;
  nextEventId: number;
  nextMoveBatchId: number;
  nextDamageId: number;
  reshufflesRemaining: number;
}

export class CompleteRulesStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompleteRulesStateError";
  }
}

const COMPLETE_STATE_KEYS = [
  "version", "ruleSetVersion", "ruleConfig", "resolution", "lifecycle", "damageFlow", "dying", "death",
  "nextEventId", "nextMoveBatchId", "nextDamageId", "reshufflesRemaining",
] as const;

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
      if (!Number.isFinite(candidate)) throw new CompleteRulesStateError(`${path} contains a non-finite number`);
      return;
    }
    if (typeof candidate !== "object" || depth > 256) throw new CompleteRulesStateError(`${path} is not strict JSON`);
    if (ancestors.includes(candidate)) throw new CompleteRulesStateError(`${path} contains a cycle`);
    ancestors.push(candidate);
    if (Array.isArray(candidate)) {
      const keys = Reflect.ownKeys(candidate);
      if (keys.length !== candidate.length + 1 || keys.some((key) => {
        if (key === "length") return false;
        if (typeof key !== "string") return true;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= candidate.length || String(index) !== key;
      })) {
        throw new CompleteRulesStateError(`${path} must be a dense array without custom properties`);
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new CompleteRulesStateError(`${path}[${index}] must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}[${index}]`, depth + 1);
      }
    } else {
      if (!isPlainRecord(candidate)) throw new CompleteRulesStateError(`${path} must be a plain object`);
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") throw new CompleteRulesStateError(`${path} contains a symbol key`);
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new CompleteRulesStateError(`${path}.${key} must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}.${key}`, depth + 1);
      }
    }
    ancestors.pop();
  };
  visit(value, label, 0);
}

function assertExactCompleteStateRoot(value: unknown): asserts value is CompleteRulesEngineState {
  if (!isPlainRecord(value)) throw new CompleteRulesStateError("complete rules state must be an object");
  const keys = Object.keys(value);
  const allowed = new Set<string>(COMPLETE_STATE_KEYS);
  if (COMPLETE_STATE_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    || keys.some((key) => !allowed.has(key))
  ) throw new CompleteRulesStateError("complete rules state has missing or unexpected fields");
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new CompleteRulesStateError(`${label} must be positive`);
}

function cloneRuleConfig(config: RoomRuleConfig): RoomRuleConfig {
  return {
    ...config,
    enabledGeneralPacks: [...config.enabledGeneralPacks],
    generalSelection: { ...config.generalSelection },
  };
}

export function createCompleteRulesEngineState(
  config: RoomRuleConfig = DEFAULT_COMPLETE_RULE_CONFIG,
): CompleteRulesEngineState {
  const clonedConfig = cloneRuleConfig(config);
  validateRoomRuleConfig(clonedConfig);
  return {
    version: 1,
    ruleSetVersion: COMPLETE_RULE_SET_VERSION,
    ruleConfig: clonedConfig,
    resolution: createResolutionStack(),
    lifecycle: createSkillLifecycleState(),
    damageFlow: createDamageFlowState(),
    dying: createDyingStack(),
    death: createDeathStack(),
    nextEventId: 1,
    nextMoveBatchId: 1,
    nextDamageId: 1,
    reshufflesRemaining: clonedConfig.maximumReshuffles,
  };
}

export function validateRoomRuleConfig(config: RoomRuleConfig): void {
  if (config.ruleSetVersion !== COMPLETE_RULE_SET_VERSION) throw new CompleteRulesStateError("unsupported rule set version");
  try {
    enabledGeneralPacks(config);
  } catch (error) {
    throw new CompleteRulesStateError(error instanceof Error ? error.message : "invalid general packs");
  }
  if (config.generalSelection.mode !== "choice" && config.generalSelection.mode !== "random") {
    throw new CompleteRulesStateError("invalid general selection mode");
  }
  if (!Number.isSafeInteger(config.generalSelection.candidatesPerPlayer) || config.generalSelection.candidatesPerPlayer <= 0 || config.generalSelection.candidatesPerPlayer > 10) {
    throw new CompleteRulesStateError("candidatesPerPlayer must be 1-10");
  }
  if (typeof config.generalSelection.allowDuplicateGenerals !== "boolean" || typeof config.godFactionChoice !== "boolean") {
    throw new CompleteRulesStateError("rule configuration booleans are invalid");
  }
  if (config.deckProfile !== "original-160") throw new CompleteRulesStateError("unsupported deck profile");
  if (!Number.isSafeInteger(config.maximumReshuffles) || config.maximumReshuffles < 0 || config.maximumReshuffles > 100) {
    throw new CompleteRulesStateError("maximumReshuffles must be 0-100");
  }
  if (!Number.isSafeInteger(config.lordBonusMinimumPlayers) || config.lordBonusMinimumPlayers < 2 || config.lordBonusMinimumPlayers > 10) {
    throw new CompleteRulesStateError("lordBonusMinimumPlayers must be 2-10");
  }
}

export function cloneCompleteRulesEngineState(state: CompleteRulesEngineState): CompleteRulesEngineState {
  return {
    version: 1,
    ruleSetVersion: state.ruleSetVersion,
    ruleConfig: cloneRuleConfig(state.ruleConfig),
    resolution: cloneResolutionStack(state.resolution),
    lifecycle: cloneSkillLifecycleState(state.lifecycle),
    damageFlow: cloneDamageFlowState(state.damageFlow),
    dying: cloneDyingStack(state.dying),
    death: cloneDeathStack(state.death),
    nextEventId: state.nextEventId,
    nextMoveBatchId: state.nextMoveBatchId,
    nextDamageId: state.nextDamageId,
    reshufflesRemaining: state.reshufflesRemaining,
  };
}

export function assertCompleteRulesEngineState(
  value: unknown,
  players?: readonly LifePlayerState[],
): asserts value is CompleteRulesEngineState {
  assertStrictJson(value, "complete rules state");
  assertExactCompleteStateRoot(value);
  const state = value;
  if (state.version !== 1 || state.ruleSetVersion !== COMPLETE_RULE_SET_VERSION) throw new CompleteRulesStateError("complete rules state version is invalid");
  if (!state.ruleConfig) throw new CompleteRulesStateError("complete rules config is missing");
  validateRoomRuleConfig(state.ruleConfig);
  try {
    assertResolutionStack(state.resolution);
    if (!state.lifecycle) throw new CompleteRulesStateError("skill lifecycle state is missing");
    assertSkillLifecycleState(state.lifecycle);
    if (!state.damageFlow) throw new CompleteRulesStateError("damage flow state is missing");
    assertDamageFlowState(state.damageFlow);
    if (!state.dying || state.dying.version !== 1 || !Array.isArray(state.dying.frames)) {
      throw new CompleteRulesStateError("dying stack root is invalid");
    }
    if (!state.death || state.death.version !== 1 || !Array.isArray(state.death.frames)) {
      throw new CompleteRulesStateError("death stack root is invalid");
    }
    if (state.dying.frames.length > 0 && players === undefined) {
      throw new CompleteRulesStateError("nonempty dying stack requires a life player snapshot");
    }
    assertDyingStack(players ?? [], state.dying);
    assertDeathStack(state.death);
  } catch (error) {
    if (error instanceof CompleteRulesStateError) throw error;
    throw new CompleteRulesStateError(error instanceof Error ? error.message : "complete rules nested state is invalid");
  }
  positive(state.nextEventId ?? 0, "nextEventId");
  positive(state.nextMoveBatchId ?? 0, "nextMoveBatchId");
  positive(state.nextDamageId ?? 0, "nextDamageId");
  if (state.damageFlow!.completedDamageIds.some((damageId) => damageId >= state.nextDamageId!)
    || state.damageFlow!.frames.some((frame) => frame.damageId >= state.nextDamageId!)
    || state.damageFlow!.completedFrameIds.some((frameId) => frameId >= state.nextDamageId!)
    || state.damageFlow!.frames.some((frame) => frame.frameId >= state.nextDamageId!)
  ) {
    throw new CompleteRulesStateError("nextDamageId must be greater than every active or completed damage/frame ID");
  }
  if (!Number.isSafeInteger(state.reshufflesRemaining) || (state.reshufflesRemaining ?? -1) < 0 || (state.reshufflesRemaining ?? 101) > state.ruleConfig.maximumReshuffles) {
    throw new CompleteRulesStateError("reshufflesRemaining is invalid");
  }
}

/** Explicit migration entry for legacy rooms that predate the complete-rules stack. */
export function migrateCompleteRulesEngineState(
  value: unknown,
  players?: readonly LifePlayerState[],
): CompleteRulesEngineState {
  if (value === undefined || value === null) return createCompleteRulesEngineState();
  assertStrictJson(value, "complete rules state");
  if (typeof value !== "object" || Array.isArray(value)) {
    assertCompleteRulesEngineState(value, players);
  }
  const migrated = structuredClone(value) as CompleteRulesEngineState;
  if (migrated.lifecycle && !Array.isArray(migrated.lifecycle.skillLosses)) {
    migrated.lifecycle.skillLosses = [];
  }
  if (migrated.damageFlow === undefined) migrated.damageFlow = createDamageFlowState();
  if (migrated.dying === undefined) migrated.dying = createDyingStack();
  if (migrated.death === undefined) migrated.death = createDeathStack();
  assertCompleteRulesEngineState(migrated, players);
  return cloneCompleteRulesEngineState(migrated);
}
