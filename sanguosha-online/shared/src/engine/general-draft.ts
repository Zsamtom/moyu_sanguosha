import { FULL_GENERAL_CATALOG, getFullGeneralDefinition, type FullGeneralFaction } from "../full-general-catalog.js";
import { isFullGeneralId, type FullGeneralId } from "../full-general-ids.js";
import { randomInteger, type ChaCha20State } from "../prng.js";
import { enabledGeneralPacks, type RoomRuleConfig } from "../rule-config.js";

export type PlayableFaction = Exclude<FullGeneralFaction, "selectable">;
export type GeneralDraftStage = "selecting_generals" | "selecting_factions" | "complete";

export interface GeneralDraftState {
  readonly version: 1;
  readonly playerIds: readonly string[];
  readonly allowDuplicateGenerals: boolean;
  readonly candidates: Readonly<Record<string, readonly FullGeneralId[]>>;
  selections: Record<string, FullGeneralId | null>;
  factionSelections: Record<string, PlayableFaction | null>;
  stage: GeneralDraftStage;
  rng: ChaCha20State;
}

export interface GeneralDraftView {
  readonly stage: GeneralDraftStage;
  readonly playerIds: readonly string[];
  /** Only the viewer's own private candidates are populated. */
  readonly candidates: readonly FullGeneralId[];
  readonly players: readonly {
    readonly playerId: string;
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

  const candidates: Record<string, readonly FullGeneralId[]> = {};
  let rng = input.rng;
  if (input.config.generalSelection.allowDuplicateGenerals) {
    for (const playerId of input.playerIds) {
      const shuffled = shuffle(pool, rng);
      rng = shuffled.state;
      candidates[playerId] = Object.freeze(shuffled.items.slice(0, candidateCount));
    }
  } else {
    const shuffled = shuffle(pool, rng);
    rng = shuffled.state;
    input.playerIds.forEach((playerId, index) => {
      candidates[playerId] = Object.freeze(shuffled.items.slice(index * candidateCount, (index + 1) * candidateCount));
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
  if (state.selections[playerId] !== null) throw new GeneralDraftError("player already selected a general");
  if (!state.candidates[playerId]?.includes(generalId)) throw new GeneralDraftError("general is not one of the player's private candidates");
  const duplicateOwner = state.playerIds.find((id) => id !== playerId && state.selections[id] === generalId);
  if (!state.allowDuplicateGenerals && duplicateOwner) throw new GeneralDraftError("general was already selected by another player");
  state.selections[playerId] = generalId;
  const definition = getFullGeneralDefinition(generalId);
  if (definition.faction !== "selectable") state.factionSelections[playerId] = definition.faction;
  updateDraftStage(state);
}

export function chooseGodFaction(state: GeneralDraftState, playerId: string, faction: PlayableFaction): void {
  if (state.stage !== "selecting_factions") throw new GeneralDraftError("god faction selection is not active");
  if (!PLAYABLE_FACTIONS.includes(faction)) throw new GeneralDraftError("invalid god faction");
  const generalId = state.selections[playerId];
  if (!generalId || getFullGeneralDefinition(generalId).faction !== "selectable") throw new GeneralDraftError("player did not select a god general");
  if (state.factionSelections[playerId] !== null) throw new GeneralDraftError("god faction was already selected");
  state.factionSelections[playerId] = faction;
  updateDraftStage(state);
}

export function autoChooseGeneral(state: GeneralDraftState, playerId: string): void {
  if (state.selections[playerId] === null) {
    const generalId = state.candidates[playerId]?.[0];
    if (!generalId) throw new GeneralDraftError("bot has no general candidate");
    chooseGeneral(state, playerId, generalId);
  }
  if (state.stage === "selecting_factions" && state.factionSelections[playerId] === null) {
    const generalId = state.selections[playerId];
    if (generalId && getFullGeneralDefinition(generalId).faction === "selectable") chooseGodFaction(state, playerId, "qun");
  }
}

export function getGeneralDraftView(state: GeneralDraftState, viewerId: string): GeneralDraftView {
  if (!state.playerIds.includes(viewerId)) throw new GeneralDraftError("viewer does not belong to this draft");
  const complete = state.stage === "complete";
  return {
    stage: state.stage,
    playerIds: [...state.playerIds],
    candidates: [...(state.candidates[viewerId] ?? [])],
    players: state.playerIds.map((playerId) => {
      const selection = state.selections[playerId] ?? null;
      const own = playerId === viewerId;
      const visibleGeneral = complete || own ? selection : null;
      const needsFaction = selection !== null && getFullGeneralDefinition(selection).faction === "selectable" && state.factionSelections[playerId] === null;
      return {
        playerId,
        selected: selection !== null,
        generalId: visibleGeneral,
        needsFaction: own && needsFaction,
        faction: complete || own ? state.factionSelections[playerId] ?? null : null,
      };
    }),
  };
}

export function finalizeGeneralDraft(state: GeneralDraftState): readonly GeneralAssignment[] {
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
    candidates: Object.freeze(Object.fromEntries(Object.entries(state.candidates).map(([playerId, candidates]) => [playerId, Object.freeze([...candidates])]))),
    selections: { ...state.selections },
    factionSelections: { ...state.factionSelections },
    rng: { ...state.rng },
  };
}

export function assertGeneralDraft(state: GeneralDraftState): void {
  if (state.version !== 1 || typeof state.allowDuplicateGenerals !== "boolean" || state.playerIds.length < 2 || state.playerIds.length > 10 || new Set(state.playerIds).size !== state.playerIds.length) {
    throw new GeneralDraftError("general draft player metadata is invalid");
  }
  const allCandidates = state.playerIds.flatMap((playerId) => [...(state.candidates[playerId] ?? [])]);
  if (allCandidates.some((generalId) => !isFullGeneralId(generalId))) throw new GeneralDraftError("general draft contains an unknown candidate");
  for (const playerId of state.playerIds) {
    const selection = state.selections[playerId] ?? null;
    if (selection !== null && !state.candidates[playerId]?.includes(selection)) throw new GeneralDraftError("selection is outside the player's candidates");
    const faction = state.factionSelections[playerId] ?? null;
    if (faction !== null && !PLAYABLE_FACTIONS.includes(faction)) throw new GeneralDraftError("draft contains an invalid faction");
    if (selection && getFullGeneralDefinition(selection).faction !== "selectable" && faction !== getFullGeneralDefinition(selection).faction) {
      throw new GeneralDraftError("non-god faction does not match general metadata");
    }
  }
  const selected = Object.values(state.selections).filter((value): value is FullGeneralId => value !== null);
  if (!state.allowDuplicateGenerals && new Set(selected).size !== selected.length) throw new GeneralDraftError("draft selected the same general twice");
  const expectedStage = state.stage;
  const clone = cloneGeneralDraft(state);
  updateDraftStage(clone);
  if (clone.stage !== expectedStage) throw new GeneralDraftError("draft stage is inconsistent with its selections");
}
