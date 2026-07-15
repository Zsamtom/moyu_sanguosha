import { describe, expect, it } from "vitest";

import {
  GeneralDraftError,
  assertGeneralDraft,
  autoChooseGeneral,
  chooseGeneral,
  chooseGodFaction,
  cloneGeneralDraft,
  createGeneralDraft,
  finalizeGeneralDraft,
  getGeneralDraftView,
} from "../src/engine/general-draft.js";
import { DEFAULT_COMPLETE_RULE_CONFIG } from "../src/rule-config.js";

const RNG = { key: "01".repeat(32), counter: 0 } as const;

describe("deterministic private general draft", () => {
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
    expect(() => chooseGeneral(draft, "a", draft.candidates.b![0]!)).toThrow(/private candidates/);
    chooseGeneral(draft, "a", draft.candidates.a![0]!);
    expect(getGeneralDraftView(draft, "a").players[0]?.generalId).toBe(draft.selections.a);
    expect(getGeneralDraftView(draft, "b").players[0]?.generalId).toBeNull();
    autoChooseGeneral(draft, "b");
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
    chooseGeneral(draft, godOwner!, godId!);
    const other = draft.playerIds.find((id) => id !== godOwner)!;
    chooseGeneral(draft, other, draft.candidates[other]![0]!);
    expect(draft.stage).toBe("selecting_factions");
    expect(getGeneralDraftView(draft, godOwner!).players.find((player) => player.playerId === godOwner)?.needsFaction).toBe(true);
    chooseGodFaction(draft, godOwner!, "wei");
    expect(draft.stage).toBe("complete");
    expect(finalizeGeneralDraft(draft).find((entry) => entry.playerId === godOwner)?.faction).toBe("wei");

    draft = cloneGeneralDraft(JSON.parse(JSON.stringify(draft)) as typeof draft);
    expect(() => assertGeneralDraft(draft)).not.toThrow();
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
});
