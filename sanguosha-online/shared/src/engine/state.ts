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
  /** Persisted scaffold; strictly empty until live dying cursors are wired. */
  dying: DyingStack;
  /** Persisted scaffold; strictly empty until live death cursors are wired. */
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

export function assertCompleteRulesEngineState(value: unknown): asserts value is CompleteRulesEngineState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompleteRulesStateError("complete rules state must be an object");
  const state = value as Partial<CompleteRulesEngineState>;
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
    if (state.dying.frames.length === 0) assertDyingStack([], state.dying);
    if (state.death.frames.length === 0) assertDeathStack(state.death);
    if (state.dying.frames.length > 0) {
      throw new CompleteRulesStateError("dying stack must remain empty until live dying integration");
    }
    if (state.death.frames.length > 0) {
      throw new CompleteRulesStateError("death stack must remain empty until live death integration");
    }
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
export function migrateCompleteRulesEngineState(value: unknown): CompleteRulesEngineState {
  if (value === undefined || value === null) return createCompleteRulesEngineState();
  if (typeof value !== "object" || Array.isArray(value)) {
    assertCompleteRulesEngineState(value);
  }
  const migrated = structuredClone(value) as CompleteRulesEngineState;
  if (migrated.lifecycle && !Array.isArray(migrated.lifecycle.skillLosses)) {
    migrated.lifecycle.skillLosses = [];
  }
  if (migrated.damageFlow === undefined) migrated.damageFlow = createDamageFlowState();
  if (migrated.dying === undefined) migrated.dying = createDyingStack();
  if (migrated.death === undefined) migrated.death = createDeathStack();
  assertCompleteRulesEngineState(migrated);
  return cloneCompleteRulesEngineState(migrated);
}
