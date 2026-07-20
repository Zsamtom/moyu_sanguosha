import { FULL_GENERAL_CATALOG, getFullGeneralDefinition, type FullGeneralFaction } from "../full-general-catalog.js";
import { isFullGeneralId, type FullGeneralId } from "../full-general-ids.js";
import { randomInteger, type ChaCha20State } from "../prng.js";
import { enabledGeneralPacks, roleDistributionForCompleteRules, type RoomRuleConfig } from "../rule-config.js";
import type { Role } from "../types.js";
import { validateRoomRuleConfig } from "./state.js";

export type PlayableFaction = Exclude<FullGeneralFaction, "selectable">;
export type GeneralDraftStage = "selecting_generals" | "selecting_factions" | "complete";

export interface GeneralDraftState {
  readonly version: 1;
  readonly playerIds: readonly string[];
  readonly allowDuplicateGenerals: boolean;
  readonly godFactionChoice: boolean;
  /** Optional only for restoring drafts created before identities moved into the draft. */
  readonly roles?: Readonly<Record<string, Role>>;
  readonly candidates: Readonly<Record<string, readonly FullGeneralId[]>>;
  selections: Record<string, FullGeneralId | null>;
  factionSelections: Record<string, PlayableFaction | null>;
  stage: GeneralDraftStage;
  rng: ChaCha20State;
}

export interface GeneralDraftView {
  readonly stage: GeneralDraftStage;
  readonly currentPlayerId: string | null;
  readonly playerIds: readonly string[];
  /** Only the viewer's own private candidates are populated. */
  readonly candidates: readonly FullGeneralId[];
  readonly players: readonly {
    readonly playerId: string;
    readonly role: Role | null;
    readonly selected: boolean;
    readonly generalId: FullGeneralId | null;
    readonly needsFaction: boolean;
    readonly faction: PlayableFaction | null;
  }[];
}

export interface GeneralAssignment {
  readonly playerId: string;
  readonly generalId: FullGeneralId;
  readonly faction: PlayableFaction;
}

export class GeneralDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneralDraftError";
  }
}

const PLAYABLE_FACTIONS: readonly PlayableFaction[] = ["wei", "shu", "wu", "qun"];
const ROLES: readonly Role[] = ["lord", "loyalist", "rebel", "renegade"];
const ORIGINAL_LORD_GENERALS: readonly FullGeneralId[] = ["liu_bei", "cao_cao", "sun_quan"];
const DRAFT_STAGES: readonly GeneralDraftStage[] = ["selecting_generals", "selecting_factions", "complete"];
const MAX_RNG_COUNTER = 0xffff_ffff;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactPlayerRecord(value: unknown, playerIds: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new GeneralDraftError(`${label} must be a player record`);
  const keys = Object.keys(value);
  const expected = new Set(playerIds);
  if (keys.length !== playerIds.length || keys.some((key) => !expected.has(key))) {
    throw new GeneralDraftError(`${label} keys do not match draft players`);
  }
}

function isPlayableFaction(value: unknown): value is PlayableFaction {
  return typeof value === "string" && PLAYABLE_FACTIONS.includes(value as PlayableFaction);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

function shuffle<T>(items: readonly T[], initial: ChaCha20State): { readonly items: T[]; readonly state: ChaCha20State } {
  const shuffled = [...items];
  let state = initial;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const generated = randomInteger(state, index + 1);
    state = generated.state;
    [shuffled[index], shuffled[generated.value]] = [shuffled[generated.value]!, shuffled[index]!];
  }
  return { items: shuffled, state };
}

function updateDraftStage(state: GeneralDraftState): void {
  if (state.playerIds.some((playerId) => (state.selections[playerId] ?? null) === null)) {
    state.stage = "selecting_generals";
    return;
  }
  if (state.playerIds.some((playerId) => {
    const generalId = state.selections[playerId] ?? null;
    return generalId !== null && getFullGeneralDefinition(generalId).faction === "selectable" && state.factionSelections[playerId] === null;
  })) {
    state.stage = "selecting_factions";
    return;
  }
  state.stage = "complete";
}

function currentDraftPlayerId(state: GeneralDraftState): string | null {
  const playerIds = state.roles
    ? (() => {
        const lordIndex = state.playerIds.findIndex((playerId) => state.roles?.[playerId] === "lord");
        return lordIndex < 0
          ? state.playerIds
          : [...state.playerIds.slice(lordIndex), ...state.playerIds.slice(0, lordIndex)];
      })()
    : state.playerIds;
  if (state.stage === "selecting_generals") {
    return playerIds.find((playerId) => state.selections[playerId] === null) ?? null;
  }
  if (state.stage === "selecting_factions") {
    return playerIds.find((playerId) => {
      const generalId = state.selections[playerId] ?? null;
      return generalId !== null && getFullGeneralDefinition(generalId).faction === "selectable" && state.factionSelections[playerId] === null;
    }) ?? null;
  }
  return null;
}

function allocateLordCandidates(pool: readonly FullGeneralId[], candidateCount: number): {
  readonly candidates: readonly FullGeneralId[];
  readonly remaining: readonly FullGeneralId[];
} {
  if (candidateCount <= 3) {
    return { candidates: pool.slice(0, candidateCount), remaining: pool.slice(candidateCount) };
  }
  const fixed = ORIGINAL_LORD_GENERALS.filter((generalId) => pool.includes(generalId));
  const remaining = pool.filter((generalId) => !fixed.includes(generalId));
  const fillerCount = candidateCount - fixed.length;
  return {
    candidates: [...fixed, ...remaining.slice(0, fillerCount)],
    remaining: remaining.slice(fillerCount),
  };
}

export function createGeneralDraft(input: {
  readonly playerIds: readonly string[];
  readonly config: RoomRuleConfig;
  readonly rng: ChaCha20State;
}): GeneralDraftState {
  if (input.playerIds.length < 2 || input.playerIds.length > 10 || new Set(input.playerIds).size !== input.playerIds.length || input.playerIds.some((id) => !id)) {
    throw new GeneralDraftError("general draft requires 2-10 unique non-empty player ids");
  }
  let packs: readonly string[];
  try {
    packs = enabledGeneralPacks(input.config);
  } catch (error) {
    throw new GeneralDraftError(error instanceof Error ? error.message : "invalid general packs");
  }
  const pool = FULL_GENERAL_CATALOG
    .filter((general) => packs.includes(general.pack))
    .map((general) => {
      if (!isFullGeneralId(general.id)) throw new GeneralDraftError(`catalog contains unknown general id: ${general.id}`);
      return general.id;
    });
  const candidateCount = input.config.generalSelection.mode === "random" ? 1 : input.config.generalSelection.candidatesPerPlayer;
  if (!Number.isSafeInteger(candidateCount) || candidateCount <= 0) throw new GeneralDraftError("candidate count must be positive");
  if (!input.config.generalSelection.allowDuplicateGenerals && candidateCount * input.playerIds.length > pool.length) {
    throw new GeneralDraftError("enabled packs do not contain enough unique general candidates");
  }

  let rng = input.rng;
  const distribution = roleDistributionForCompleteRules(input.playerIds.length);
  const shuffledRoles = shuffle([
    ...Array<Role>(distribution.lord).fill("lord"),
    ...Array<Role>(distribution.loyalist).fill("loyalist"),
    ...Array<Role>(distribution.rebel).fill("rebel"),
    ...Array<Role>(distribution.renegade).fill("renegade"),
  ], rng);
  rng = shuffledRoles.state;
  const roles = Object.fromEntries(input.playerIds.map((playerId, index) => [
    playerId,
    shuffledRoles.items[index],
  ])) as Record<string, Role>;
  const lordId = input.playerIds.find((playerId) => roles[playerId] === "lord");
  if (!lordId) throw new GeneralDraftError("identity shuffle did not assign a lord");

  const candidates: Record<string, readonly FullGeneralId[]> = {};
  if (input.config.generalSelection.allowDuplicateGenerals) {
    for (const playerId of input.playerIds) {
      const shuffled = shuffle(pool, rng);
      rng = shuffled.state;
      const dealt = playerId === lordId
        ? allocateLordCandidates(shuffled.items, candidateCount).candidates
        : shuffled.items.slice(0, candidateCount);
      candidates[playerId] = Object.freeze(dealt);
    }
  } else {
    const shuffled = shuffle(pool, rng);
    rng = shuffled.state;
    const lord = allocateLordCandidates(shuffled.items, candidateCount);
    candidates[lordId] = Object.freeze(lord.candidates);
    input.playerIds.filter((playerId) => playerId !== lordId).forEach((playerId, index) => {
      candidates[playerId] = Object.freeze(lord.remaining.slice(index * candidateCount, (index + 1) * candidateCount));
    });
  }

  const selections = Object.fromEntries(input.playerIds.map((playerId) => [
    playerId,
    input.config.generalSelection.mode === "random" ? candidates[playerId]?.[0] ?? null : null,
  ])) as Record<string, FullGeneralId | null>;
  const factionSelections = Object.fromEntries(input.playerIds.map((playerId) => [playerId, null])) as Record<string, PlayableFaction | null>;
  for (const playerId of input.playerIds) {
    const generalId = selections[playerId];
    if (!generalId) continue;
    const faction = getFullGeneralDefinition(generalId).faction;
    if (faction !== "selectable") {
      factionSelections[playerId] = faction;
    } else if (!input.config.godFactionChoice) {
        const generated = randomInteger(rng, PLAYABLE_FACTIONS.length);
        rng = generated.state;
        factionSelections[playerId] = PLAYABLE_FACTIONS[generated.value]!;
    }
  }
  const state: GeneralDraftState = {
    version: 1,
    playerIds: Object.freeze([...input.playerIds]),
    allowDuplicateGenerals: input.config.generalSelection.allowDuplicateGenerals,
    godFactionChoice: input.config.godFactionChoice,
    roles: Object.freeze(roles),
    candidates: Object.freeze(candidates),
    selections,
    factionSelections,
    stage: "selecting_generals",
    rng,
  };
  updateDraftStage(state);
  return state;
}

export function chooseGeneral(state: GeneralDraftState, playerId: string, generalId: FullGeneralId): void {
  if (state.stage !== "selecting_generals") throw new GeneralDraftError("general selection is not active");
  if (!state.playerIds.includes(playerId)) throw new GeneralDraftError("player does not belong to this draft");
  if (state.roles && currentDraftPlayerId(state) !== playerId) throw new GeneralDraftError("players must select generals in seat order");
  if (state.selections[playerId] !== null) throw new GeneralDraftError("player already selected a general");
  if (!state.candidates[playerId]?.includes(generalId)) throw new GeneralDraftError("general is not one of the player's private candidates");
  const duplicateOwner = state.playerIds.find((id) => id !== playerId && state.selections[id] === generalId);
  if (!state.allowDuplicateGenerals && duplicateOwner) throw new GeneralDraftError("general was already selected by another player");
  state.selections[playerId] = generalId;
  const definition = getFullGeneralDefinition(generalId);
  if (definition.faction !== "selectable") {
    state.factionSelections[playerId] = definition.faction;
  } else if (!state.godFactionChoice) {
    const generated = randomInteger(state.rng, PLAYABLE_FACTIONS.length);
    state.rng = generated.state;
    state.factionSelections[playerId] = PLAYABLE_FACTIONS[generated.value]!;
  }
  updateDraftStage(state);
}

export function chooseGodFaction(state: GeneralDraftState, playerId: string, faction: PlayableFaction): void {
  if (!state.godFactionChoice) throw new GeneralDraftError("god faction selection is disabled");
  if (state.stage !== "selecting_factions") throw new GeneralDraftError("god faction selection is not active");
  if (state.roles && currentDraftPlayerId(state) !== playerId) throw new GeneralDraftError("players must select god factions in seat order");
  if (!PLAYABLE_FACTIONS.includes(faction)) throw new GeneralDraftError("invalid god faction");
  const generalId = state.selections[playerId];
  if (!generalId || getFullGeneralDefinition(generalId).faction !== "selectable") throw new GeneralDraftError("player did not select a god general");
  if (state.factionSelections[playerId] !== null) throw new GeneralDraftError("god faction was already selected");
  state.factionSelections[playerId] = faction;
  updateDraftStage(state);
}

export function autoChooseGeneral(state: GeneralDraftState, playerId: string): void {
  if (state.roles && currentDraftPlayerId(state) !== playerId) return;
  if (state.selections[playerId] === null) {
    const generalId = state.candidates[playerId]?.[0];
    if (!generalId) throw new GeneralDraftError("bot has no general candidate");
    chooseGeneral(state, playerId, generalId);
  }
  if (state.godFactionChoice && state.stage === "selecting_factions" && state.factionSelections[playerId] === null) {
    const generalId = state.selections[playerId];
    if (generalId && getFullGeneralDefinition(generalId).faction === "selectable") chooseGodFaction(state, playerId, "qun");
  }
}

export function getGeneralDraftView(state: GeneralDraftState, viewerId: string): GeneralDraftView {
  if (!state.playerIds.includes(viewerId)) throw new GeneralDraftError("viewer does not belong to this draft");
  const complete = state.stage === "complete";
  return {
    stage: state.stage,
    currentPlayerId: state.roles ? currentDraftPlayerId(state) : null,
    playerIds: [...state.playerIds],
    candidates: [...(state.candidates[viewerId] ?? [])],
    players: state.playerIds.map((playerId) => {
      const selection = state.selections[playerId] ?? null;
      const own = playerId === viewerId;
      const visibleGeneral = complete || own ? selection : null;
      const needsFaction = state.godFactionChoice && selection !== null && getFullGeneralDefinition(selection).faction === "selectable" && state.factionSelections[playerId] === null;
      return {
        playerId,
        role: own || state.roles?.[playerId] === "lord" ? state.roles?.[playerId] ?? null : null,
        selected: selection !== null,
        generalId: visibleGeneral,
        needsFaction: own && needsFaction,
        faction: complete || own ? state.factionSelections[playerId] ?? null : null,
      };
    }),
  };
}

export function finalizeGeneralDraft(state: GeneralDraftState): readonly GeneralAssignment[] {
  assertGeneralDraft(state);
  if (state.stage !== "complete") throw new GeneralDraftError("general draft is incomplete");
  return Object.freeze(state.playerIds.map((playerId) => {
    const generalId = state.selections[playerId];
    const faction = state.factionSelections[playerId];
    if (!generalId || !faction) throw new GeneralDraftError("complete draft has an incomplete assignment");
    return Object.freeze({ playerId, generalId, faction });
  }));
}

export function cloneGeneralDraft(state: GeneralDraftState): GeneralDraftState {
  return {
    ...state,
    playerIds: Object.freeze([...state.playerIds]),
    ...(state.roles ? { roles: Object.freeze({ ...state.roles }) } : {}),
    candidates: Object.freeze(Object.fromEntries(Object.entries(state.candidates).map(([playerId, candidates]) => [playerId, Object.freeze([...candidates])]))),
    selections: { ...state.selections },
    factionSelections: { ...state.factionSelections },
    rng: { ...state.rng },
  };
}

export function assertGeneralDraft(state: GeneralDraftState): void {
  if (state.version !== 1 || !Array.isArray(state.playerIds) || typeof state.allowDuplicateGenerals !== "boolean" ||
      typeof state.godFactionChoice !== "boolean" ||
      state.playerIds.length < 2 || state.playerIds.length > 10 ||
      state.playerIds.some((playerId) => typeof playerId !== "string" || playerId.length === 0) ||
      new Set(state.playerIds).size !== state.playerIds.length) {
    throw new GeneralDraftError("general draft player metadata is invalid");
  }
  if (!DRAFT_STAGES.includes(state.stage)) throw new GeneralDraftError("general draft stage is invalid");
  if (!isRecord(state.rng) || typeof state.rng.key !== "string" || !/^[0-9a-f]{64}$/.test(state.rng.key) ||
      !Number.isSafeInteger(state.rng.counter) || state.rng.counter < 0 || state.rng.counter > MAX_RNG_COUNTER) {
    throw new GeneralDraftError("general draft RNG state is invalid");
  }
  assertExactPlayerRecord(state.candidates, state.playerIds, "candidate record");
  assertExactPlayerRecord(state.selections, state.playerIds, "selection record");
  assertExactPlayerRecord(state.factionSelections, state.playerIds, "faction record");
  if (state.roles !== undefined) {
    assertExactPlayerRecord(state.roles, state.playerIds, "role record");
    const counts: Record<Role, number> = { lord: 0, loyalist: 0, rebel: 0, renegade: 0 };
    for (const playerId of state.playerIds) {
      const role = state.roles[playerId];
      if (!isRole(role)) throw new GeneralDraftError("general draft contains an invalid role");
      counts[role] += 1;
    }
    const expected = roleDistributionForCompleteRules(state.playerIds.length);
    if (ROLES.some((role) => counts[role] !== expected[role])) {
      throw new GeneralDraftError("general draft roles do not match the original identity rules");
    }
  }

  const allCandidates: FullGeneralId[] = [];
  const selectionOrder = state.roles
    ? (() => {
        const lordIndex = state.playerIds.findIndex((playerId) => state.roles?.[playerId] === "lord");
        return lordIndex < 0
          ? state.playerIds
          : [...state.playerIds.slice(lordIndex), ...state.playerIds.slice(0, lordIndex)];
      })()
    : state.playerIds;
  for (const playerId of selectionOrder) {
    const candidates = state.candidates[playerId] as unknown;
    if (!Array.isArray(candidates) || candidates.length === 0 ||
        candidates.some((generalId) => typeof generalId !== "string" || !isFullGeneralId(generalId))) {
      throw new GeneralDraftError("general draft contains invalid candidates");
    }
    if (new Set(candidates).size !== candidates.length) {
      throw new GeneralDraftError("a player's candidate list contains duplicates");
    }
    allCandidates.push(...candidates as FullGeneralId[]);
  }
  if (!state.allowDuplicateGenerals && new Set(allCandidates).size !== allCandidates.length) {
    throw new GeneralDraftError("general draft candidate lists overlap");
  }

  const selected: FullGeneralId[] = [];
  let encounteredUnselected = false;
  for (const playerId of selectionOrder) {
    const selection = state.selections[playerId] as unknown;
    if (selection !== null && (typeof selection !== "string" || !isFullGeneralId(selection))) {
      throw new GeneralDraftError("general draft contains an invalid selection");
    }
    if (selection !== null && !(state.candidates[playerId] as readonly FullGeneralId[]).includes(selection)) {
      throw new GeneralDraftError("selection is outside the player's candidates");
    }
    if (selection === null) encounteredUnselected = true;
    if (state.roles && selection !== null && encounteredUnselected) {
      throw new GeneralDraftError("general selections do not follow seat order");
    }
    if (selection !== null) selected.push(selection);
  }
  if (!state.allowDuplicateGenerals && new Set(selected).size !== selected.length) {
    throw new GeneralDraftError("draft selected the same general twice");
  }

  const hasUnselectedGeneral = selected.length !== state.playerIds.length;
  for (const playerId of state.playerIds) {
    const selection = state.selections[playerId] as FullGeneralId | null;
    const faction = state.factionSelections[playerId] as unknown;
    if (faction !== null && !isPlayableFaction(faction)) {
      throw new GeneralDraftError("draft contains an invalid faction");
    }
    if (selection === null) {
      if (faction !== null) throw new GeneralDraftError("an unselected player cannot have a faction");
      continue;
    }
    const definition = getFullGeneralDefinition(selection);
    if (definition.faction !== "selectable" && faction !== definition.faction) {
      throw new GeneralDraftError("non-god faction does not match general metadata");
    }
    if (definition.faction === "selectable" && state.godFactionChoice && hasUnselectedGeneral && faction !== null) {
      throw new GeneralDraftError("god faction cannot be chosen before general selection finishes");
    }
  }

  const expectedStage = state.stage;
  const clone = cloneGeneralDraft(state);
  updateDraftStage(clone);
  if (clone.stage !== expectedStage) throw new GeneralDraftError("draft stage is inconsistent with its selections");
}

export function assertGeneralDraftForConfig(state: GeneralDraftState, config: RoomRuleConfig): void {
  assertGeneralDraft(state);
  let packs: readonly string[];
  try {
    validateRoomRuleConfig(config);
    packs = enabledGeneralPacks(config);
  } catch (error) {
    throw new GeneralDraftError(error instanceof Error ? error.message : "invalid room rule configuration");
  }
  const selection = config.generalSelection;
  if (state.allowDuplicateGenerals !== selection.allowDuplicateGenerals) {
    throw new GeneralDraftError("draft duplicate policy does not match room configuration");
  }
  if (state.godFactionChoice !== config.godFactionChoice) {
    throw new GeneralDraftError("draft god-faction policy does not match room configuration");
  }
  if (selection.mode === "random" && state.playerIds.some((playerId) => state.selections[playerId] === null)) {
    throw new GeneralDraftError("random draft contains an unselected general");
  }
  if (!config.godFactionChoice && state.playerIds.some((playerId) => {
    const generalId = state.selections[playerId] ?? null;
    return generalId !== null && getFullGeneralDefinition(generalId).faction === "selectable" && state.factionSelections[playerId] === null;
  })) {
    throw new GeneralDraftError("automatic god faction is missing");
  }
  const expectedCandidateCount = selection.mode === "random" ? 1 : selection.candidatesPerPlayer;
  for (const playerId of state.playerIds) {
    const candidates = state.candidates[playerId]!;
    if (candidates.length !== expectedCandidateCount) {
      throw new GeneralDraftError("draft candidate count does not match room configuration");
    }
    if (candidates.some((generalId) => !packs.includes(getFullGeneralDefinition(generalId).pack))) {
      throw new GeneralDraftError("draft contains a candidate from a disabled pack");
    }
  }
}
