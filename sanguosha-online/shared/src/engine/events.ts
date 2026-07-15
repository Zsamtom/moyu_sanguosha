import type { PlayerId } from "../types.js";
import { cloneJsonObject as cloneStrictJsonObject, type JsonObject, type JsonValue } from "./resolution.js";

export const GAME_EVENT_TYPES = [
  "game_started",
  "turn_before",
  "turn_started",
  "turn_finished",
  "turn_after",
  "phase_before",
  "phase_started",
  "phase_ended",
  "phase_after",
  "card_use_declared",
  "target_confirming",
  "target_confirmed",
  /** Legacy aggregate hook retained while old skills migrate to per-target hooks. */
  "targets_confirmed",
  "card_committed",
  "card_finished",
  "card_responded",
  "cards_moving",
  "cards_moved",
  "hand_became_empty",
  "equipment_lost",
  "judgment_started",
  "judgment_replacing",
  "judgment_finished",
  "damage_created",
  "damage_redirecting",
  "damage_modifying",
  "damage_applied",
  "damage_dealt",
  "damage_received",
  "damage_completed",
  "hp_lost",
  "recovered",
  "dying_started",
  "dying_rescued",
  "death_before",
  "death",
  "pindian_started",
  "pindian_revealed",
  "pindian_finished",
  "skill_gained",
  "skill_lost",
] as const;

export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

export interface GameEvent {
  readonly eventId: number;
  readonly type: GameEventType;
  readonly frameId: number | null;
  readonly turnId: number | null;
  readonly phaseInstanceId: number | null;
  readonly sourceId: PlayerId | null;
  readonly targetIds: readonly PlayerId[];
  readonly reasonId: string;
  readonly payload: JsonObject;
}

export interface EventStreamState {
  nextEventId: number;
}

export type SkillRuleCategory = "locked" | "optional" | "lord" | "limited" | "awakening" | "post_awakening" | "special";

export interface TriggerSpec {
  /** Stable within one rules skill, for example `after_damage_gain_card`. */
  readonly id: string;
  readonly event: GameEventType;
  readonly compulsory: boolean;
  readonly conditionId: string;
  readonly effectId: string;
  readonly priority: number;
}

export interface ActiveSkillSpec {
  readonly id: string;
  readonly programId: string;
  readonly usage: "unlimited" | "once_per_phase" | "once_per_turn" | "limited_once";
}

export interface ViewAsSpec {
  readonly id: string;
  readonly programId: string;
  readonly enabledFor: readonly ("use" | "respond")[];
}

export const MODIFIER_QUERY_TYPES = [
  "distance_from",
  "distance_to",
  "attack_range",
  "hand_limit",
  "effective_card_kind",
  "effective_card_suit",
  "effective_card_color",
  "card_use_limit",
  "response_count",
  "target_legal",
  "effect_valid",
  "draw_count",
] as const;

export type ModifierQueryType = (typeof MODIFIER_QUERY_TYPES)[number];

export interface ModifierSpec {
  readonly id: string;
  readonly query: ModifierQueryType;
  readonly handlerId: string;
  readonly priority: number;
}

export interface SkillRuleDefinition {
  readonly rulesId: string;
  readonly name: string;
  readonly categories: readonly SkillRuleCategory[];
  readonly triggers: readonly TriggerSpec[];
  readonly active: readonly ActiveSkillSpec[];
  readonly viewAs: readonly ViewAsSpec[];
  readonly modifiers: readonly ModifierSpec[];
}

export interface SkillInstance {
  readonly ownerId: PlayerId;
  readonly rulesId: string;
  /** Stable order within the owner's current effective skill list. */
  readonly registrationOrder: number;
  readonly grantedBy: string | null;
}

export interface TriggerEvaluationContext {
  readonly currentTurnPlayerId: PlayerId | null;
  /** Living circular seat order. Dead owners should not be present here. */
  readonly seatOrder: readonly PlayerId[];
}

export interface EventTriggerRef {
  readonly triggerId: string;
  readonly eventId: number;
  readonly ownerId: PlayerId;
  readonly rulesId: string;
  readonly triggerSpecId: string;
  readonly effectId: string;
  readonly compulsory: boolean;
  readonly priority: number;
  /** Null for an event-wide trigger; otherwise one exact target occurrence. */
  readonly targetIndex: number | null;
  readonly registrationOrder: number;
}

export interface TriggerWindow {
  readonly event: GameEvent;
  pending: EventTriggerRef[];
  consumedTriggerIds: string[];
}

export type TriggerTargetEvaluator = (
  definition: SkillRuleDefinition,
  spec: TriggerSpec,
  instance: SkillInstance,
  event: GameEvent,
) => false | readonly (number | null)[];

export type ModifierOperation = "add" | "set" | "minimum" | "maximum" | "allow" | "deny";

export interface ModifierContribution {
  readonly contributionId: string;
  readonly ownerId: PlayerId;
  readonly rulesId: string;
  readonly modifierSpecId: string;
  readonly priority: number;
  readonly operation: ModifierOperation;
  readonly value: JsonValue;
}

export class EventEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventEngineError";
  }
}

function nonEmpty(value: string, label: string): void {
  if (!value) throw new EventEngineError(`${label} is required`);
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new EventEngineError(`${label} must be positive`);
}

function deepFreezeJson<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) value.forEach((entry) => deepFreezeJson(entry));
    else Object.values(value).forEach((entry) => deepFreezeJson(entry));
    Object.freeze(value);
  }
  return value;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneStrictJsonObject(value);
}

function freezeDefinition(definition: SkillRuleDefinition): SkillRuleDefinition {
  return Object.freeze({
    ...definition,
    categories: Object.freeze([...definition.categories]),
    triggers: Object.freeze(definition.triggers.map((trigger) => Object.freeze({ ...trigger }))),
    active: Object.freeze(definition.active.map((active) => Object.freeze({ ...active }))),
    viewAs: Object.freeze(definition.viewAs.map((viewAs) => Object.freeze({ ...viewAs, enabledFor: Object.freeze([...viewAs.enabledFor]) }))),
    modifiers: Object.freeze(definition.modifiers.map((modifier) => Object.freeze({ ...modifier }))),
  });
}

function validateDefinition(definition: SkillRuleDefinition): void {
  nonEmpty(definition.rulesId, "rulesId");
  nonEmpty(definition.name, "skill name");
  if (definition.categories.length === 0 || new Set(definition.categories).size !== definition.categories.length) {
    throw new EventEngineError(`${definition.rulesId} must have unique categories`);
  }
  const localIds = [
    ...definition.triggers.map((entry) => entry.id),
    ...definition.active.map((entry) => entry.id),
    ...definition.viewAs.map((entry) => entry.id),
    ...definition.modifiers.map((entry) => entry.id),
  ];
  if (localIds.some((id) => !id) || new Set(localIds).size !== localIds.length) {
    throw new EventEngineError(`${definition.rulesId} contains duplicate or empty spec ids`);
  }
  for (const trigger of definition.triggers) {
    nonEmpty(trigger.conditionId, "trigger conditionId");
    nonEmpty(trigger.effectId, "trigger effectId");
    if (!Number.isSafeInteger(trigger.priority)) throw new EventEngineError("trigger priority must be an integer");
  }
  for (const modifier of definition.modifiers) {
    nonEmpty(modifier.handlerId, "modifier handlerId");
    if (!Number.isSafeInteger(modifier.priority)) throw new EventEngineError("modifier priority must be an integer");
  }
}

export class SkillRegistry {
  readonly #definitions = new Map<string, SkillRuleDefinition>();

  register(definition: SkillRuleDefinition): void {
    validateDefinition(definition);
    if (this.#definitions.has(definition.rulesId)) throw new EventEngineError(`duplicate skill definition: ${definition.rulesId}`);
    this.#definitions.set(definition.rulesId, freezeDefinition(definition));
  }

  get(rulesId: string): SkillRuleDefinition {
    const definition = this.#definitions.get(rulesId);
    if (!definition) throw new EventEngineError(`unknown skill definition: ${rulesId}`);
    return definition;
  }

  has(rulesId: string): boolean {
    return this.#definitions.has(rulesId);
  }

  all(): readonly SkillRuleDefinition[] {
    return Object.freeze([...this.#definitions.values()]);
  }

  assertCoverage(requiredRulesIds: readonly string[]): void {
    const unique = new Set(requiredRulesIds);
    if (unique.size !== requiredRulesIds.length) throw new EventEngineError("required skill list contains duplicates");
    const missing = [...unique].filter((rulesId) => !this.#definitions.has(rulesId));
    if (missing.length > 0) throw new EventEngineError(`missing skill definitions: ${missing.join(", ")}`);
  }
}

export function createGameEvent(
  stream: EventStreamState,
  input: Omit<GameEvent, "eventId">,
): GameEvent {
  positive(stream.nextEventId, "nextEventId");
  if (stream.nextEventId >= Number.MAX_SAFE_INTEGER) throw new EventEngineError("event id exhausted");
  nonEmpty(input.reasonId, "event reasonId");
  if (input.targetIds.some((targetId) => !targetId)) throw new EventEngineError("event target ids must be nonempty");
  if (new Set(input.targetIds).size !== input.targetIds.length) throw new EventEngineError("event target ids are duplicated");
  const payload = deepFreezeJson(cloneJsonObject(input.payload));
  const event: GameEvent = Object.freeze({
    ...input,
    eventId: stream.nextEventId,
    targetIds: Object.freeze([...input.targetIds]),
    payload,
  });
  stream.nextEventId += 1;
  return event;
}

function ownerSeatRank(ownerId: PlayerId, context: TriggerEvaluationContext): number {
  const ownerIndex = context.seatOrder.indexOf(ownerId);
  if (ownerIndex < 0) return Number.MAX_SAFE_INTEGER;
  if (context.currentTurnPlayerId === null) return ownerIndex;
  const currentIndex = context.seatOrder.indexOf(context.currentTurnPlayerId);
  if (currentIndex < 0) return ownerIndex;
  return (ownerIndex - currentIndex + context.seatOrder.length) % context.seatOrder.length;
}

function targetRank(index: number | null): number {
  return index ?? -1;
}

function triggerComparator(context: TriggerEvaluationContext, eventType: GameEventType) {
  const targetSpecific = eventType === "target_confirming" || eventType === "target_confirmed";
  return (left: EventTriggerRef, right: EventTriggerRef): number =>
    (targetSpecific ? targetRank(left.targetIndex) - targetRank(right.targetIndex) : 0) ||
    right.priority - left.priority ||
    ownerSeatRank(left.ownerId, context) - ownerSeatRank(right.ownerId, context) ||
    (!targetSpecific ? targetRank(left.targetIndex) - targetRank(right.targetIndex) : 0) ||
    left.registrationOrder - right.registrationOrder ||
    left.triggerId.localeCompare(right.triggerId);
}

export function buildTriggerWindow(
  registry: SkillRegistry,
  event: GameEvent,
  instances: readonly SkillInstance[],
  context: TriggerEvaluationContext,
  evaluateTargets: TriggerTargetEvaluator = (_definition, _spec, _instance, currentEvent) =>
    currentEvent.targetIds.length === 0 ? [null] : [0],
): TriggerWindow {
  if (new Set(context.seatOrder).size !== context.seatOrder.length) throw new EventEngineError("seat order contains duplicates");
  const instanceKeys = instances.map((instance) => `${instance.ownerId}:${instance.rulesId}:${instance.registrationOrder}:${instance.grantedBy ?? "base"}`);
  if (new Set(instanceKeys).size !== instanceKeys.length) throw new EventEngineError("effective skill instances are duplicated");
  const pending: EventTriggerRef[] = [];
  for (const instance of instances) {
    if (!context.seatOrder.includes(instance.ownerId)) continue;
    const definition = registry.get(instance.rulesId);
    definition.triggers.forEach((spec) => {
      if (spec.event !== event.type) return;
      const targetIndexes = evaluateTargets(definition, spec, instance, event);
      if (targetIndexes === false) return;
      const targetSpecific = event.type === "target_confirming" || event.type === "target_confirmed";
      if (
        new Set(targetIndexes).size !== targetIndexes.length ||
        targetIndexes.some((index) => index !== null && (!Number.isSafeInteger(index) || index < 0 || index >= event.targetIds.length)) ||
        (targetSpecific && targetIndexes.some((index) => index === null))
      ) {
        throw new EventEngineError("trigger target indexes do not match event targets");
      }
      for (const targetIndex of targetIndexes) {
        pending.push({
          triggerId: `${event.eventId}:${instance.ownerId}:${instance.rulesId}:${spec.id}:${targetIndex ?? "global"}`,
          eventId: event.eventId,
          ownerId: instance.ownerId,
          rulesId: instance.rulesId,
          triggerSpecId: spec.id,
          effectId: spec.effectId,
          compulsory: spec.compulsory,
          priority: spec.priority,
          targetIndex,
          registrationOrder: instance.registrationOrder,
        });
      }
    });
  }
  pending.sort(triggerComparator(context, event.type));
  if (new Set(pending.map((trigger) => trigger.triggerId)).size !== pending.length) {
    throw new EventEngineError("trigger ids are not unique");
  }
  return { event, pending, consumedTriggerIds: [] };
}

/** Allows one owner to order their currently simultaneous highest-priority triggers. */
export function orderOwnerTriggers(
  window: TriggerWindow,
  ownerId: PlayerId,
  orderedTriggerIds: readonly string[],
): void {
  const head = window.pending[0];
  if (!head || head.ownerId !== ownerId) throw new EventEngineError("owner is not next in action order");
  const orderable = window.pending.filter((trigger) =>
    trigger.ownerId === ownerId &&
    trigger.priority === head.priority &&
    trigger.targetIndex === head.targetIndex
  );
  if (orderable.length <= 1) throw new EventEngineError("owner has no simultaneous triggers to order");
  if (orderedTriggerIds.length !== orderable.length || new Set(orderedTriggerIds).size !== orderable.length) {
    throw new EventEngineError("ordered trigger ids do not cover the orderable group");
  }
  const byId = new Map(orderable.map((trigger) => [trigger.triggerId, trigger]));
  if (orderedTriggerIds.some((id) => !byId.has(id))) throw new EventEngineError("ordered trigger id belongs to another group");
  const positions = window.pending
    .map((trigger, index) => orderable.some((candidate) => candidate.triggerId === trigger.triggerId) ? index : -1)
    .filter((index) => index >= 0);
  orderedTriggerIds.forEach((id, index) => { window.pending[positions[index]!] = byId.get(id)!; });
}

export function consumeTrigger(window: TriggerWindow, triggerId: string): EventTriggerRef {
  if (window.consumedTriggerIds.includes(triggerId)) throw new EventEngineError("trigger was already consumed");
  const index = window.pending.findIndex((trigger) => trigger.triggerId === triggerId);
  if (index < 0) {
    throw new EventEngineError("trigger does not belong to this window");
  }
  if (index !== 0) throw new EventEngineError("trigger is not next in resolution order");
  const [trigger] = window.pending.splice(0, 1);
  if (!trigger) throw new EventEngineError("failed to consume trigger");
  window.consumedTriggerIds.push(trigger.triggerId);
  return trigger;
}

export function cloneTriggerWindow(window: TriggerWindow): TriggerWindow {
  return {
    event: {
      ...window.event,
      targetIds: Object.freeze([...window.event.targetIds]),
      payload: deepFreezeJson(cloneJsonObject(window.event.payload)),
    },
    pending: window.pending.map((trigger) => ({ ...trigger })),
    consumedTriggerIds: [...window.consumedTriggerIds],
  };
}

export function assertTriggerWindow(window: TriggerWindow): void {
  positive(window.event.eventId, "eventId");
  cloneJsonObject(window.event.payload);
  const pendingIds = window.pending.map((trigger) => trigger.triggerId);
  if (new Set(pendingIds).size !== pendingIds.length) throw new EventEngineError("pending triggers are duplicated");
  if (new Set(window.consumedTriggerIds).size !== window.consumedTriggerIds.length) throw new EventEngineError("consumed triggers are duplicated");
  if (pendingIds.some((id) => window.consumedTriggerIds.includes(id))) throw new EventEngineError("trigger is both pending and consumed");
  for (const trigger of window.pending) {
    if (trigger.eventId !== window.event.eventId || !trigger.triggerId.startsWith(`${window.event.eventId}:`)) {
      throw new EventEngineError("trigger belongs to another event");
    }
    if (trigger.targetIndex !== null && (!Number.isSafeInteger(trigger.targetIndex) || trigger.targetIndex < 0 || trigger.targetIndex >= window.event.targetIds.length)) {
      throw new EventEngineError("trigger target index is outside the event target list");
    }
    if ((window.event.type === "target_confirming" || window.event.type === "target_confirmed") && trigger.targetIndex === null) {
      throw new EventEngineError("per-target event contains a global trigger");
    }
  }
}

export function applyNumericModifiers(base: number, contributions: readonly ModifierContribution[]): number {
  if (!Number.isFinite(base)) throw new EventEngineError("numeric modifier base must be finite");
  let value = base;
  const ordered = [...contributions].sort((left, right) => right.priority - left.priority || left.contributionId.localeCompare(right.contributionId));
  for (const contribution of ordered) {
    if (contribution.operation === "allow" || contribution.operation === "deny") {
      throw new EventEngineError("boolean operation used in numeric modifier pipeline");
    }
    if (typeof contribution.value !== "number" || !Number.isFinite(contribution.value)) throw new EventEngineError("numeric modifier contribution must be a finite number");
    switch (contribution.operation) {
      case "add": value += contribution.value; break;
      case "set": value = contribution.value; break;
      case "minimum": value = Math.max(value, contribution.value); break;
      case "maximum": value = Math.min(value, contribution.value); break;
    }
  }
  if (!Number.isFinite(value)) throw new EventEngineError("numeric modifiers produced a non-finite result");
  return value;
}

export function applyBooleanModifiers(base: boolean, contributions: readonly ModifierContribution[]): boolean {
  let value = base;
  const ordered = [...contributions].sort((left, right) => right.priority - left.priority || left.contributionId.localeCompare(right.contributionId));
  for (const contribution of ordered) {
    if (contribution.operation === "allow") value = true;
    else if (contribution.operation === "deny") value = false;
    else if (contribution.operation === "set" && typeof contribution.value === "boolean") value = contribution.value;
    else throw new EventEngineError("numeric or malformed operation used in boolean modifier pipeline");
  }
  return value;
}
