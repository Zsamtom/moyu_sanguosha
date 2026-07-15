import { describe, expect, it } from "vitest";

import {
  CardUseFrameError,
  assertCardUseFrame,
  beginTargetConfirmation,
  beginTargetResolution,
  cancelCurrentTarget,
  cloneCardUseFrame,
  commitCardUseFrame,
  confirmCurrentTarget,
  createCardUseFrame,
  redirectCurrentTarget,
  resolveCurrentTarget,
  setCurrentTargetResponsePolicy,
} from "../src/index.js";

const frame = () => createCardUseFrame({
  frameId: 9,
  useId: 12,
  sourceId: "a",
  method: "use",
  physicalCardIds: ["slash-card"],
  effectiveKind: "slash",
  targetIds: ["b", "c"],
});

describe("serializable per-target card-use frame", () => {
  it("confirms and resolves every stable target occurrence in order", () => {
    const use = frame();
    expect(beginTargetConfirmation(use)?.targetId).toBe("b");
    confirmCurrentTarget(use);
    expect(use.targetCursor).toBe(1);
    confirmCurrentTarget(use);
    expect(use).toMatchObject({ stage: "targets_confirmed", targetCursor: null });
    commitCardUseFrame(use);
    expect(beginTargetResolution(use)?.targetId).toBe("b");
    expect(resolveCurrentTarget(use)?.targetId).toBe("c");
    expect(resolveCurrentTarget(use)).toBeNull();
    expect(use.stage).toBe("finished");
    expect(() => assertCardUseFrame(use)).not.toThrow();
  });

  it("redirects only the current occurrence without reordering later targets", () => {
    const use = frame();
    beginTargetConfirmation(use);
    redirectCurrentTarget(use, "d", "liuli:event-1");
    setCurrentTargetResponsePolicy(use, { requiredResponses: 2, responseProhibited: true, modifierId: "tieqi:event-2" });
    confirmCurrentTarget(use);
    expect(use.targetOccurrences.map((entry) => [entry.occurrenceId, entry.originalTargetId, entry.targetId])).toEqual([
      [1, "b", "d"], [2, "c", "c"],
    ]);
    expect(use.targetOccurrences[0]?.responsePolicy).toEqual({
      requiredResponses: 2,
      responseProhibited: true,
      modifierIds: ["liuli:event-1", "tieqi:event-2"],
    });
    expect(() => redirectCurrentTarget(use, "d", "duplicate")).toThrow(CardUseFrameError);
  });

  it("can cancel one occurrence and safely finish a targetless card", () => {
    const use = frame();
    beginTargetConfirmation(use);
    cancelCurrentTarget(use, "qianxun:deny");
    confirmCurrentTarget(use);
    commitCardUseFrame(use);
    expect(beginTargetResolution(use)?.targetId).toBe("c");
    resolveCurrentTarget(use);
    expect(use.targetOccurrences.map((entry) => entry.status)).toEqual(["canceled", "resolved"]);

    const targetless = createCardUseFrame({ frameId: 1, useId: 2, sourceId: "a", method: "use", physicalCardIds: ["ex"], effectiveKind: "ex_nihilo", targetIds: [] });
    expect(beginTargetConfirmation(targetless)).toBeNull();
    commitCardUseFrame(targetless);
    expect(beginTargetResolution(targetless)).toBeNull();
    expect(targetless.stage).toBe("finished");
  });

  it("deep-clones recovery state and rejects forged derived cursors/status", () => {
    const use = frame();
    beginTargetConfirmation(use);
    redirectCurrentTarget(use, "d", "liuli:event-1");
    const restored = cloneCardUseFrame(JSON.parse(JSON.stringify(use)) as typeof use);
    expect(restored).toEqual(use);
    restored.targetOccurrences[0]!.metadata.secret = "changed";
    expect(use.targetOccurrences[0]?.metadata).toEqual({});
    restored.targetCursor = 1;
    expect(() => assertCardUseFrame(restored)).toThrow(/cursor/);
  });

  it("rejects duplicate physical cards, duplicate targets and unknown cards", () => {
    expect(() => createCardUseFrame({ frameId: 1, useId: 1, sourceId: "a", method: "use", physicalCardIds: ["x", "x"], effectiveKind: "slash", targetIds: [] })).toThrow(/physical/);
    expect(() => createCardUseFrame({ frameId: 1, useId: 1, sourceId: "a", method: "use", physicalCardIds: ["x"], effectiveKind: "slash", targetIds: ["b", "b"] })).toThrow(/target/);
    expect(() => createCardUseFrame({ frameId: 1, useId: 1, sourceId: "a", method: "use", physicalCardIds: ["x"], effectiveKind: "missing" as never, targetIds: [] })).toThrow(/unknown/);
  });
});
