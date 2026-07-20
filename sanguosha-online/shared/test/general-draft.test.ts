import { describe, expect, it } from "vitest";

import {
  GeneralDraftError,
  assertGeneralDraft,
  assertGeneralDraftForConfig,
  autoChooseGeneral,
  chooseGeneral,
  chooseGodFaction,
  cloneGeneralDraft,
  createGeneralDraft,
  finalizeGeneralDraft,
  getGeneralDraftView,
} from "../src/engine/general-draft.js";
import { createGameFromDraft, getGameView } from "../src/game.js";
import { getGeneralDefinition } from "../src/generals.js";
import { DEFAULT_COMPLETE_RULE_CONFIG } from "../src/rule-config.js";

const RNG = { key: "01".repeat(32), counter: 0 } as const;

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function chooseGeneralsInOrder(
  draft: ReturnType<typeof createGeneralDraft>,
  choices: Readonly<Record<string, string>> = {},
): void {
  while (draft.stage === "selecting_generals") {
    const playerId = getGeneralDraftView(draft, draft.playerIds[0]!).currentPlayerId;
    if (!playerId) throw new Error("draft has no current player");
    chooseGeneral(draft, playerId, (choices[playerId] ?? draft.candidates[playerId]![0]!) as never);
  }
}

describe("deterministic private general draft", () => {
  it("randomizes identities before selection and makes the lord choose first from the lord pool", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 5 },
      lordBonusMinimumPlayers: 4,
    };
    const draft = createGeneralDraft({ playerIds: ["a", "b", "c", "d"], config, rng: RNG });

    expect(Object.values(draft.roles ?? {}).sort()).toEqual(["lord", "loyalist", "rebel", "renegade"].sort());
    const lordId = draft.playerIds.find((playerId) => draft.roles?.[playerId] === "lord")!;
    const nextId = draft.playerIds[(draft.playerIds.indexOf(lordId) + 1) % draft.playerIds.length]!;
    expect(draft.candidates[lordId]?.slice(0, 3)).toEqual(["liu_bei", "cao_cao", "sun_quan"]);
    expect(getGeneralDraftView(draft, nextId).currentPlayerId).toBe(lordId);
    expect(getGeneralDraftView(draft, nextId).players.find((player) => player.playerId === lordId)?.role).toBe("lord");
    expect(() => chooseGeneral(draft, nextId, draft.candidates[nextId]![0]!)).toThrow(/seat order/);

    chooseGeneral(draft, lordId, draft.candidates[lordId]![0]!);
    expect(getGeneralDraftView(draft, nextId).currentPlayerId).toBe(nextId);
    while (draft.stage !== "complete") {
      const currentPlayerId = getGeneralDraftView(draft, lordId).currentPlayerId;
      if (!currentPlayerId) throw new Error("draft has no current player");
      autoChooseGeneral(draft, currentPlayerId);
    }
    const game = createGameFromDraft({ draft, config });
    expect(game.players.map(({ id, role }) => ({ id, role }))).toEqual(
      draft.playerIds.map((id) => ({ id, role: draft.roles?.[id] })),
    );
    const lord = game.players.find((player) => player.id === lordId)!;
    expect(game.currentPlayerId).toBe(lordId);
    expect(lord.maxHp).toBe(getGeneralDefinition(lord.generalId!).maxHp + 1);
  });

  it("deals disjoint private candidates reproducibly without leaking them", () => {
    const input = { playerIds: ["a", "b", "c"], config: DEFAULT_COMPLETE_RULE_CONFIG, rng: RNG } as const;
    const left = createGeneralDraft(input);
    const right = createGeneralDraft(input);
    expect(left).toEqual(right);
    const all = Object.values(left.candidates).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(getGeneralDraftView(left, "a").candidates).toEqual(left.candidates.a);
    expect(getGeneralDraftView(left, "a").players.find((player) => player.playerId === "b")?.generalId).toBeNull();
    assertGeneralDraft(left);
  });

  it("accepts only the acting player's candidate and reveals all assignments only when complete", () => {
    const draft = createGeneralDraft({ playerIds: ["a", "b"], config: DEFAULT_COMPLETE_RULE_CONFIG, rng: RNG });
    const firstId = getGeneralDraftView(draft, "a").currentPlayerId!;
    const secondId = draft.playerIds.find((playerId) => playerId !== firstId)!;
    expect(() => chooseGeneral(draft, firstId, draft.candidates[secondId]![0]!)).toThrow(/private candidates/);
    chooseGeneral(draft, firstId, draft.candidates[firstId]![0]!);
    expect(getGeneralDraftView(draft, firstId).players.find((player) => player.playerId === firstId)?.generalId).toBe(draft.selections[firstId]);
    expect(getGeneralDraftView(draft, secondId).players.find((player) => player.playerId === firstId)?.generalId).toBeNull();
    autoChooseGeneral(draft, secondId);
    if (draft.stage === "selecting_factions") {
      for (const playerId of draft.playerIds) autoChooseGeneral(draft, playerId);
    }
    expect(draft.stage).toBe("complete");
    expect(getGeneralDraftView(draft, "b").players.every((player) => player.generalId !== null)).toBe(true);
    expect(finalizeGeneralDraft(draft)).toHaveLength(2);
  });

  it("requires a persisted Wei/Shu/Wu/Qun choice for god generals", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 10 },
    };
    let draft = createGeneralDraft({ playerIds: ["a", "b"], config, rng: RNG });
    const godOwner = draft.playerIds.find((playerId) => draft.candidates[playerId]?.some((id) => id.startsWith("shen_")));
    expect(godOwner).toBeDefined();
    const godId = draft.candidates[godOwner!]?.find((id) => id.startsWith("shen_"));
    const other = draft.playerIds.find((id) => id !== godOwner)!;
    chooseGeneralsInOrder(draft, { [godOwner!]: godId!, [other]: draft.candidates[other]![0]! });
    expect(draft.stage).toBe("selecting_factions");
    expect(getGeneralDraftView(draft, godOwner!).players.find((player) => player.playerId === godOwner)?.needsFaction).toBe(true);
    chooseGodFaction(draft, godOwner!, "wei");
    expect(draft.stage).toBe("complete");
    expect(finalizeGeneralDraft(draft).find((entry) => entry.playerId === godOwner)?.faction).toBe("wei");

    draft = cloneGeneralDraft(JSON.parse(JSON.stringify(draft)) as typeof draft);
    expect(() => assertGeneralDraft(draft)).not.toThrow();
  });

  it("assigns a deterministic god faction when room rules disable player choice", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 10 },
      godFactionChoice: false,
    };
    const left = createGeneralDraft({ playerIds: ["a", "b"], config, rng: RNG });
    const right = createGeneralDraft({ playerIds: ["a", "b"], config, rng: RNG });
    const godOwner = left.playerIds.find((playerId) =>
      left.candidates[playerId]?.some((generalId) => generalId.startsWith("shen_")),
    )!;
    const other = left.playerIds.find((playerId) => playerId !== godOwner)!;
    const godId = left.candidates[godOwner]!.find((generalId) => generalId.startsWith("shen_"))!;
    const otherId = left.candidates[other]!.find((generalId) => !generalId.startsWith("shen_"))!;

    for (const draft of [left, right]) {
      chooseGeneralsInOrder(draft, { [godOwner]: godId, [other]: otherId });
      expect(draft.factionSelections[godOwner]).toMatch(/^(wei|shu|wu|qun)$/);
      expect(getGeneralDraftView(draft, godOwner).players.find((player) => player.playerId === godOwner)?.needsFaction).toBe(false);
      expect(draft.stage).toBe("complete");
      expect(() => chooseGodFaction(draft, godOwner, "wei")).toThrow(/disabled/);
      expect(() => assertGeneralDraftForConfig(draft, config)).not.toThrow();
    }
    expect(left.factionSelections[godOwner]).toBe(right.factionSelections[godOwner]);
    expect(left.rng).toEqual(right.rng);
  });

  it("supports immediate deterministic random assignments for a standard-only room", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, mode: "random" as const },
    };
    const draft = createGeneralDraft({ playerIds: ["a", "b", "c", "d"], config, rng: RNG });
    expect(draft.stage).toBe("complete");
    expect(finalizeGeneralDraft(draft).map((entry) => entry.generalId)).toHaveLength(4);
  });

  it("rejects too-small unique pools and corrupt restored selections", () => {
    const impossible = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 10 },
    };
    expect(() => createGeneralDraft({ playerIds: ["a", "b", "c"], config: impossible, rng: RNG })).toThrow(/enough unique/);

    const draft = createGeneralDraft({ playerIds: ["a", "b"], config: DEFAULT_COMPLETE_RULE_CONFIG, rng: RNG });
    draft.selections.a = draft.candidates.b![0]!;
    expect(() => assertGeneralDraft(draft)).toThrow(GeneralDraftError);
  });

  it("rejects malformed records, duplicate candidates, RNG corruption, and inconsistent stages", () => {
    const draft = createGeneralDraft({ playerIds: ["a", "b"], config: DEFAULT_COMPLETE_RULE_CONFIG, rng: RNG });
    for (const recordName of ["candidates", "selections", "factionSelections"] as const) {
      const extra = jsonClone(draft);
      (extra[recordName] as unknown as Record<string, unknown>).intruder = null;
      expect(() => assertGeneralDraft(extra)).toThrow(/keys/);

      const missing = jsonClone(draft);
      delete (missing[recordName] as unknown as Record<string, unknown>).b;
      expect(() => assertGeneralDraft(missing)).toThrow(/keys/);
    }

    const repeatedOwnCandidate = jsonClone(draft);
    const ownCandidates = repeatedOwnCandidate.candidates.a as unknown as string[];
    ownCandidates[1] = ownCandidates[0]!;
    expect(() => assertGeneralDraft(repeatedOwnCandidate)).toThrow(/duplicates/);

    const overlappingCandidates = jsonClone(draft);
    (overlappingCandidates.candidates.b as unknown as string[])[0] = overlappingCandidates.candidates.a![0]!;
    expect(() => assertGeneralDraft(overlappingCandidates)).toThrow(/overlap/);

    for (const rng of [
      { key: "01".repeat(31), counter: 0 },
      { key: "zz".repeat(32), counter: 0 },
      { key: "AB".repeat(32), counter: 0 },
      { key: "01".repeat(32), counter: -1 },
      { key: "01".repeat(32), counter: 0x1_0000_0000 },
      { key: "01".repeat(32), counter: 1.5 },
    ]) {
      expect(() => assertGeneralDraft({ ...jsonClone(draft), rng } as typeof draft)).toThrow(/RNG/);
    }

    const unknownStage = jsonClone(draft);
    (unknownStage as unknown as { stage: string }).stage = "unknown";
    expect(() => assertGeneralDraft(unknownStage)).toThrow(/stage/);
    expect(() => assertGeneralDraft({ ...jsonClone(draft), stage: "complete" })).toThrow(/stage/);

    const wrongDistribution = jsonClone(draft);
    wrongDistribution.roles!.a = "lord";
    wrongDistribution.roles!.b = "lord";
    expect(() => assertGeneralDraft(wrongDistribution)).toThrow(/identity rules/);
  });

  it("enforces selection and faction invariants before finalization", () => {
    const standardConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
    };
    const draft = createGeneralDraft({ playerIds: ["a", "b"], config: standardConfig, rng: RNG });

    const factionWithoutGeneral = jsonClone(draft);
    factionWithoutGeneral.factionSelections.a = "wei";
    expect(() => assertGeneralDraft(factionWithoutGeneral)).toThrow(/unselected player/);

    const wrongFixedFaction = jsonClone(draft);
    const currentPlayerId = getGeneralDraftView(wrongFixedFaction, "a").currentPlayerId!;
    chooseGeneral(wrongFixedFaction, currentPlayerId, wrongFixedFaction.candidates[currentPlayerId]![0]!);
    wrongFixedFaction.factionSelections[currentPlayerId] = wrongFixedFaction.factionSelections[currentPlayerId] === "wei" ? "shu" : "wei";
    expect(() => assertGeneralDraft(wrongFixedFaction)).toThrow(/non-god faction/);

    const invalidFaction = jsonClone(draft);
    (invalidFaction.factionSelections as unknown as Record<string, string | null>).a = "god";
    expect(() => assertGeneralDraft(invalidFaction)).toThrow(/invalid faction/);

    const godConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 10 },
    };
    const earlyGodFaction = Array.from({ length: 100 }, (_, index) => createGeneralDraft({
      playerIds: ["a", "b", "c"], config: godConfig,
      rng: { key: (index + 1).toString(16).padStart(64, "0"), counter: 0 },
    })).find((candidate) => {
      const current = getGeneralDraftView(candidate, "a").currentPlayerId!;
      return candidate.candidates[current]?.some((generalId) => generalId.startsWith("shen_"));
    })!;
    const owner = getGeneralDraftView(earlyGodFaction, "a").currentPlayerId!;
    chooseGeneral(earlyGodFaction, owner, earlyGodFaction.candidates[owner]!.find((generalId) => generalId.startsWith("shen_"))!);
    earlyGodFaction.factionSelections[owner] = "wei";
    expect(() => assertGeneralDraft(earlyGodFaction)).toThrow(/before general selection finishes/);

    const complete = createGeneralDraft({
      playerIds: ["a", "b"],
      config: { ...standardConfig, generalSelection: { ...standardConfig.generalSelection, mode: "random" as const } },
      rng: RNG,
    });
    complete.factionSelections.a = complete.factionSelections.a === "wei" ? "shu" : "wei";
    expect(() => finalizeGeneralDraft(complete)).toThrow(GeneralDraftError);
  });

  it("cross-checks restored drafts against their room configuration", () => {
    const draft = createGeneralDraft({ playerIds: ["a", "b"], config: DEFAULT_COMPLETE_RULE_CONFIG, rng: RNG });
    expect(() => assertGeneralDraftForConfig(draft, DEFAULT_COMPLETE_RULE_CONFIG)).not.toThrow();

    const shortCandidates = jsonClone(draft);
    (shortCandidates.candidates.a as unknown as string[]).pop();
    expect(() => assertGeneralDraft(shortCandidates)).not.toThrow();
    expect(() => assertGeneralDraftForConfig(shortCandidates, DEFAULT_COMPLETE_RULE_CONFIG)).toThrow(/candidate count/);

    const standardConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
    };
    const disabledPack = jsonClone(createGeneralDraft({ playerIds: ["a", "b"], config: standardConfig, rng: RNG }));
    (disabledPack.candidates.a as unknown as string[])[0] = "cao_ren";
    expect(() => assertGeneralDraft(disabledPack)).not.toThrow();
    expect(() => assertGeneralDraftForConfig(disabledPack, standardConfig)).toThrow(/disabled pack/);

    expect(() => assertGeneralDraftForConfig(draft, {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, allowDuplicateGenerals: true },
    })).toThrow(/duplicate policy/);

    expect(() => assertGeneralDraftForConfig(draft, {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      godFactionChoice: false,
    })).toThrow(/god-faction policy/);

    const randomConfig = {
      ...standardConfig,
      generalSelection: { ...standardConfig.generalSelection, mode: "random" as const },
    };
    const incompleteRandom = jsonClone(createGeneralDraft({ playerIds: ["a", "b"], config: randomConfig, rng: RNG }));
    const lordIndex = incompleteRandom.playerIds.findIndex((playerId) => incompleteRandom.roles?.[playerId] === "lord");
    const lastPlayerId = incompleteRandom.playerIds[(lordIndex + incompleteRandom.playerIds.length - 1) % incompleteRandom.playerIds.length]!;
    incompleteRandom.selections[lastPlayerId] = null;
    incompleteRandom.factionSelections[lastPlayerId] = null;
    incompleteRandom.stage = "selecting_generals";
    expect(() => assertGeneralDraft(incompleteRandom)).not.toThrow();
    expect(() => assertGeneralDraftForConfig(incompleteRandom, randomConfig)).toThrow(/random draft/);

    const duplicateConfig = {
      ...standardConfig,
      generalSelection: { ...standardConfig.generalSelection, allowDuplicateGenerals: true },
    };
    const duplicateDraft = jsonClone(createGeneralDraft({ playerIds: ["a", "b"], config: duplicateConfig, rng: RNG }));
    const sharedCandidate = duplicateDraft.candidates.a!.find((generalId) => !duplicateDraft.candidates.b!.includes(generalId))!;
    (duplicateDraft.candidates.b as unknown as string[])[0] = sharedCandidate;
    expect(() => assertGeneralDraftForConfig(duplicateDraft, duplicateConfig)).not.toThrow();

    expect(() => assertGeneralDraftForConfig(draft, {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "wind", "wind"] as const,
    })).toThrow(GeneralDraftError);
    expect(() => assertGeneralDraftForConfig(draft, {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      deckProfile: "unsupported" as "original-160",
    })).toThrow(GeneralDraftError);
  });

  it("starts the authoritative 160-card game from finalized assignments and original roles", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard"] as const,
      lordBonusMinimumPlayers: 4,
    };
    const draft = createGeneralDraft({ playerIds: ["a", "b", "c", "d"], config, rng: RNG });
    while (draft.stage !== "complete") {
      const currentPlayerId = getGeneralDraftView(draft, draft.playerIds[0]!).currentPlayerId;
      if (!currentPlayerId) throw new Error("draft has no current player");
      autoChooseGeneral(draft, currentPlayerId);
    }
    const assignments = finalizeGeneralDraft(draft);
    const frozenDraft = jsonClone(draft);

    const game = createGameFromDraft({ draft, config });

    expect(draft).toEqual(frozenDraft);
    expect(game.completeRules.ruleConfig).toEqual(config);
    expect(game.players.map(({ id, generalId }) => ({ id, generalId }))).toEqual(
      assignments.map(({ playerId, generalId }) => ({ id: playerId, generalId })),
    );
    expect(game.players.map((player) => player.role).sort()).toEqual(
      ["lord", "loyalist", "rebel", "renegade"].sort(),
    );
    expect(game.players.every((player) => player.hand.length >= 4 && player.godFaction === null)).toBe(true);
    expect(game.players.reduce((count, player) => count + player.hand.length, game.deck.length)).toBe(160);
    const lord = game.players.find((player) => player.role === "lord")!;
    expect(lord.maxHp).toBe(getGeneralDefinition(lord.generalId!).maxHp + 1);
    expect(game.currentPlayerId).toBe(lord.id);
  });

  it("persists a god's selected ordinary faction into live faction projection", () => {
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"] as const,
      generalSelection: { ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection, candidatesPerPlayer: 10 },
    };
    const draft = createGeneralDraft({ playerIds: ["god-owner", "other"], config, rng: RNG });
    const godId = draft.candidates["god-owner"]?.find((id) => id.startsWith("shen_"));
    const fixedId = draft.candidates.other?.find((id) => !id.startsWith("shen_"));
    expect(godId).toBeDefined();
    expect(fixedId).toBeDefined();
    chooseGeneralsInOrder(draft, { "god-owner": godId!, other: fixedId! });
    chooseGodFaction(draft, "god-owner", "wu");

    const game = createGameFromDraft({ draft, config });
    const god = game.players.find((player) => player.id === "god-owner")!;
    expect(god).toMatchObject({ generalId: godId, godFaction: "wu" });
    expect(getGameView(game, god.id).players.find((player) => player.id === god.id)?.general?.faction).toBe("wu");
    expect(game.players.find((player) => player.id === "other")?.godFaction).toBeNull();
  });
});
