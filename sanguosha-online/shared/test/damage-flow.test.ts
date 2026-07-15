import { describe, expect, it } from "vitest";

import { createDamageInstance } from "../src/engine/damage.js";
import type { DamageInstance, LifePlayerState } from "../src/engine/damage.js";
import {
  DamageFlowError,
  actOnDamageOpportunity,
  applyDamageLifeFlow,
  closeDamageFlowWindow,
  createDamageFlowState,
  currentDamageFlowPrompt,
  deserializeDamageFlowState,
  finishDamageFlowFrame,
  migrateDamageFlowState,
  openDamageFlowWindow,
  pushDamageFlowFrame,
  restoreDamageFlowState,
  resumeDamageAfterDyingFlow,
  serializeDamageFlowState,
  type DamageFlowCallerContinuation,
  type DamageFlowState,
  type DamageFlowWindowKind,
  type DamageOpportunityAction,
  type DamageOpportunityCadence,
  type DamageOpportunityRef,
} from "../src/engine/damage-flow.js";
import {
  createDyingFrame,
  resolveDyingEntrySave,
  type DyingFrame,
} from "../src/engine/dying.js";

function life(): LifePlayerState[] {
  return [
    { id: "a", hp: 4, maxHp: 4, alive: true },
    { id: "b", hp: 4, maxHp: 4, alive: true },
    { id: "c", hp: 4, maxHp: 4, alive: true },
    { id: "d", hp: 4, maxHp: 4, alive: true },
  ];
}

function damage(input: {
  damageId?: number;
  frameId?: number;
  sourceId?: string | null;
  targetId?: string;
  amount?: number;
} = {}): DamageInstance {
  return createDamageInstance({
    damageId: input.damageId ?? 1,
    frameId: input.frameId ?? 1,
    sourceId: input.sourceId === undefined ? "a" : input.sourceId,
    targetId: input.targetId ?? "b",
    nature: "fire",
    reason: { type: "skill", id: "test_damage" },
    amount: input.amount ?? 1,
  });
}

function top(state: DamageFlowState) {
  const frame = state.frames.at(-1);
  if (!frame) throw new Error("test expected an active frame");
  return frame;
}

function pushRoot(instance = damage()): DamageFlowState {
  return pushDamageFlowFrame(createDamageFlowState(), {
    expectedParentFrameId: null,
    expectedRevision: 0,
    damage: instance,
  }).state;
}

function openWindow(
  state: DamageFlowState,
  players: readonly LifePlayerState[],
  kind: DamageFlowWindowKind,
  opportunities: readonly DamageOpportunityRef[] = [],
): DamageFlowState {
  return openDamageFlowWindow(state, {
    frameId: top(state).frameId,
    expectedRevision: state.revision,
    kind,
    opportunities,
    players,
  });
}

function closeWindow(state: DamageFlowState): DamageFlowState {
  const window = top(state).window;
  if (!window) throw new Error("test expected an open window");
  return closeDamageFlowWindow(state, {
    frameId: top(state).frameId,
    windowId: window.windowId,
    expectedRevision: state.revision,
  });
}

function emptyWindow(
  state: DamageFlowState,
  players: readonly LifePlayerState[],
  kind: DamageFlowWindowKind,
): DamageFlowState {
  return closeWindow(openWindow(state, players, kind));
}

function advanceToLife(state: DamageFlowState, players: readonly LifePlayerState[]): DamageFlowState {
  state = emptyWindow(state, players, "causing_modifier");
  state = emptyWindow(state, players, "redirect");
  return emptyWindow(state, players, "receiving_modifier");
}

function completePostDamage(state: DamageFlowState, players: readonly LifePlayerState[]): DamageFlowState {
  while (top(state).step === "post_damage") {
    state = emptyWindow(state, players, top(state).damage.stage as DamageFlowWindowKind);
  }
  expect(top(state).step).toBe("complete");
  return state;
}

function ref(input: {
  id: string;
  owner: string;
  skill?: string;
  relation: "source" | "target" | "global";
  cadence?: DamageOpportunityCadence;
  point?: number | null;
}): DamageOpportunityRef {
  return {
    opportunityId: input.id,
    ownerId: input.owner,
    skillId: input.skill ?? `skill_${input.id}`,
    relation: input.relation,
    cadence: input.cadence ?? "once",
    pointIndex: input.point ?? null,
  };
}

function actionFor(
  state: DamageFlowState,
  overrides: Partial<DamageOpportunityAction> = {},
): DamageOpportunityAction {
  const prompt = currentDamageFlowPrompt(state);
  if (!prompt) throw new Error("test expected a prompt");
  return {
    actionId: state.nextActionId,
    promptId: prompt.promptId,
    frameId: prompt.frameId,
    damageId: prompt.damageId,
    windowId: prompt.windowId,
    opportunityId: prompt.opportunityId,
    ownerId: prompt.ownerId,
    expectedRevision: state.revision,
    outcome: "pass",
    resolutionRef: null,
    effect: { type: "none" },
    ...overrides,
  };
}

function expectCode(run: () => unknown, code: DamageFlowError["code"]): void {
  try {
    run();
    throw new Error(`expected DamageFlowError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DamageFlowError);
    expect((error as DamageFlowError).code).toBe(code);
  }
}

function buquProof(
  players: readonly LifePlayerState[],
  state: DamageFlowState,
  eventId = 901,
): DyingFrame {
  const frame = top(state);
  if (!frame.dying) throw new Error("test expected a pending dying barrier");
  const proof = createDyingFrame(players, {
    frameId: frame.dying.dyingId,
    victimId: frame.dying.targetId,
    reason: { type: "damage", eventId, sourceId: frame.damage.sourceId },
    responderOrder: players.filter((player) => player.alive).map((player) => player.id),
    entrySaveSkillIds: ["buqu"],
  });
  resolveDyingEntrySave(players, proof, { skillId: "buqu", survives: true });
  return proof;
}

describe("versioned damage flow orchestration", () => {
  it("supports a null source and never invents source post-damage windows", () => {
    let players = life();
    let state = pushRoot(damage({ sourceId: null }));
    state = advanceToLife(state, players);
    const lifeResult = applyDamageLifeFlow(state, players, {
      frameId: 1,
      expectedRevision: state.revision,
    });
    players = lifeResult.players;
    state = lifeResult.state;
    expect(top(state).damage.stage).toBe("target_after_once");

    const seen: string[] = [];
    while (top(state).step === "post_damage") {
      seen.push(top(state).damage.stage);
      state = emptyWindow(state, players, top(state).damage.stage as DamageFlowWindowKind);
    }
    expect(seen).toEqual(["target_after_once", "target_after_per_point", "settlement_end"]);
    const finished = finishDamageFlowFrame(state, {
      frameId: 1,
      resumeToken: null,
      expectedRevision: state.revision,
      players: null,
    });
    expect(finished.state.frames).toEqual([]);
    expect(finished.state.completedDamageIds).toEqual([1]);
    expect(finished.callerContinuation).toBeNull();
  });

  it("persists exact once/per-point order for three damage points", () => {
    let players = life();
    let state = advanceToLife(pushRoot(damage({ amount: 3 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision });
    state = applied.state;
    players = applied.players;
    const seen: Array<[string, number | null]> = [];
    while (top(state).step === "post_damage") {
      const kind = top(state).damage.stage as DamageFlowWindowKind;
      state = openWindow(state, players, kind);
      seen.push([top(state).window!.kind, top(state).window!.pointIndex]);
      state = closeWindow(state);
    }
    expect(seen).toEqual([
      ["source_after_once", null],
      ["source_after_per_point", 1],
      ["source_after_per_point", 2],
      ["source_after_per_point", 3],
      ["target_after_once", null],
      ["target_after_per_point", 1],
      ["target_after_per_point", 2],
      ["target_after_per_point", 3],
      ["settlement_end", null],
    ]);
  });

  it("resumes lethal damage, keeps source/global triggers, and filters the dead target owner", () => {
    let players = life().map((player) => player.id === "b" ? { ...player, hp: 2 } : player);
    let state = advanceToLife(pushRoot(damage({ amount: 3 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision });
    expect(applied.application).toMatchObject({ hpAfter: -1, entersDying: true });
    expect(applied.dying).not.toBeNull();
    players = applied.players.map((player) => player.id === "b" ? { ...player, alive: false } : player);
    state = resumeDamageAfterDyingFlow(applied.state, players, {
      frameId: 1,
      dyingId: applied.dying!.dyingId,
      expectedRevision: applied.state.revision,
      outcome: "dead",
    });

    state = openWindow(state, players, "source_after_once", [
      ref({ id: "source-once", owner: "a", relation: "source" }),
    ]);
    expect(currentDamageFlowPrompt(state)?.ownerId).toBe("a");
    state = actOnDamageOpportunity(state, actionFor(state));
    state = closeWindow(state);
    for (let point = 1; point <= 3; point += 1) {
      state = emptyWindow(state, players, "source_after_per_point");
    }

    state = openWindow(state, players, "target_after_once", [
      ref({ id: "dead-target", owner: "b", relation: "target" }),
      ref({ id: "living-global", owner: "c", relation: "global" }),
    ]);
    expect(top(state).window!.opportunities.map((entry) => entry.status)).toEqual(["skipped_dead", "pending"]);
    expect(currentDamageFlowPrompt(state)).toMatchObject({ opportunityId: "living-global", ownerId: "c" });
  });

  it("resumes a verified Buqu survivor through the ordinary post-damage window order", () => {
    let players = life().map((player) => player.id === "b" ? { ...player, hp: 1 } : player);
    let state = advanceToLife(pushRoot(damage({ damageId: 29, frameId: 17, amount: 2 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 17, expectedRevision: state.revision });
    players = applied.players;
    expect(applied.application).toMatchObject({ hpAfter: -1, entersDying: true });
    expect(applied.dying).toMatchObject({ dyingId: 1, frameId: 17, damageId: 29, targetId: "b" });

    const proof = buquProof(players, applied.state, 901);
    expect(proof.reason.eventId).toBe(901);
    expect(proof.reason.eventId).not.toBe(top(applied.state).damageId);
    const proofBefore = structuredClone(proof);
    state = resumeDamageAfterDyingFlow(applied.state, players, {
      frameId: 17,
      dyingId: 1,
      expectedRevision: applied.state.revision,
      outcome: "protected_by_buqu",
      proof,
    });
    expect(proof).toEqual(proofBefore);
    expect(top(state)).toMatchObject({ step: "post_damage", dying: null, damage: { stage: "source_after_once" } });

    const seen: Array<[string, number | null]> = [];
    while (top(state).step === "post_damage") {
      state = openWindow(state, players, top(state).damage.stage as DamageFlowWindowKind);
      seen.push([top(state).window!.kind, top(state).window!.pointIndex]);
      state = closeWindow(state);
    }
    expect(seen).toEqual([
      ["source_after_once", null],
      ["source_after_per_point", 1],
      ["source_after_per_point", 2],
      ["target_after_once", null],
      ["target_after_per_point", 1],
      ["target_after_per_point", 2],
      ["settlement_end", null],
    ]);
    expect(top(state).step).toBe("complete");
  });

  it.each([
    { name: "dying frame ID", mutate: (proof: DyingFrame) => Object.assign(proof, { frameId: proof.frameId + 1 }) },
    { name: "victim", mutate: (proof: DyingFrame) => Object.assign(proof, { victimId: "c" }) },
    { name: "damage reason type", mutate: (proof: DyingFrame) => Object.assign(proof.reason, { type: "hp_loss" }) },
    { name: "damage source", mutate: (proof: DyingFrame) => Object.assign(proof.reason, { sourceId: "c" }) },
    { name: "stage", mutate: (proof: DyingFrame) => Object.assign(proof, { stage: "rescue" }) },
    { name: "survival skill", mutate: (proof: DyingFrame) => Object.assign(proof, { survivalSkillId: "niepan" }) },
    { name: "missing resolution", mutate: (proof: DyingFrame) => proof.skillResolutions.splice(0) },
    { name: "resolution timing", mutate: (proof: DyingFrame) => Object.assign(proof.skillResolutions[0]!, { timing: "victim_response" }) },
    { name: "resolution result", mutate: (proof: DyingFrame) => Object.assign(proof.skillResolutions[0]!, { succeeded: false }) },
    { name: "resolution HP", mutate: (proof: DyingFrame) => Object.assign(proof.skillResolutions[0]!, { hpAfter: -2 }) },
  ])("rejects a Buqu proof with a forged $name", ({ mutate }) => {
    const players = life().map((player) => player.id === "b" ? { ...player, hp: 1 } : player);
    let state = advanceToLife(pushRoot(damage({ damageId: 29, frameId: 17, amount: 2 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 17, expectedRevision: state.revision });
    const proof = structuredClone(buquProof(applied.players, applied.state)) as DyingFrame;
    mutate(proof);

    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      frameId: 17,
      dyingId: 1,
      expectedRevision: applied.state.revision,
      outcome: "protected_by_buqu",
      proof,
    }), "INVALID_DYING_RESULT");
    expect(top(applied.state)).toMatchObject({ step: "dying", damage: { stage: "life_deducted" } });
  });

  it("rejects a stale-HP proof and a dead or positive-HP protected target", () => {
    const players = life().map((player) => player.id === "b" ? { ...player, hp: 1 } : player);
    let state = advanceToLife(pushRoot(damage({ amount: 2 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision });
    const proof = buquProof(applied.players, applied.state);
    const resume = (snapshot: readonly LifePlayerState[]) => resumeDamageAfterDyingFlow(applied.state, snapshot, {
      frameId: 1,
      dyingId: 1,
      expectedRevision: applied.state.revision,
      outcome: "protected_by_buqu",
      proof,
    });

    expectCode(() => resume(applied.players.map((player) => player.id === "b" ? { ...player, hp: -2 } : player)), "INVALID_DYING_RESULT");
    expectCode(() => resume(applied.players.map((player) => player.id === "b" ? { ...player, alive: false } : player)), "INVALID_DYING_RESULT");
    expectCode(() => resume(applied.players.map((player) => player.id === "b" ? { ...player, hp: 1 } : player)), "INVALID_DYING_RESULT");
  });

  it("enforces the strict proof-bearing outcome union at runtime", () => {
    const players = life().map((player) => player.id === "b" ? { ...player, hp: 1 } : player);
    let state = advanceToLife(pushRoot(damage({ amount: 2 })), players);
    const applied = applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision });
    const proof = buquProof(applied.players, applied.state);
    const base = { frameId: 1, dyingId: 1, expectedRevision: applied.state.revision };

    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "rescued",
    }), "INVALID_DYING_RESULT");
    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "rescued", proof,
    } as never), "INVALID_ARGUMENT");
    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "dead", proof,
    } as never), "INVALID_ARGUMENT");
    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "protected_by_buqu",
    } as never), "INVALID_ARGUMENT");

    const extraField = structuredClone(proof) as DyingFrame & { forged?: boolean };
    extraField.forged = true;
    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "protected_by_buqu", proof: extraField,
    }), "INVALID_DYING_RESULT");

    const cyclic = structuredClone(proof) as DyingFrame & { loop?: unknown };
    cyclic.loop = cyclic;
    expectCode(() => resumeDamageAfterDyingFlow(applied.state, applied.players, {
      ...base, outcome: "protected_by_buqu", proof: cyclic,
    }), "INVALID_STATE");
  });

  it("uses an opaque child token, resumes the exact parent once, and refreshes dead owners", () => {
    let players = life();
    let parent = advanceToLife(pushRoot(damage()), players);
    const parentLife = applyDamageLifeFlow(parent, players, { frameId: 1, expectedRevision: parent.revision });
    parent = parentLife.state;
    players = parentLife.players;
    parent = openWindow(parent, players, "source_after_once", [
      ref({ id: "b-global", owner: "b", relation: "global" }),
      ref({ id: "c-global", owner: "c", relation: "global" }),
    ]);
    const oldParentPrompt = currentDamageFlowPrompt(parent)!;

    const childPush = pushDamageFlowFrame(parent, {
      expectedParentFrameId: 1,
      expectedRevision: parent.revision,
      damage: damage({ damageId: 2, frameId: 2, sourceId: "c", targetId: "b", amount: 3 }),
    });
    expect(childPush.resumeToken).toMatch(/^dfr1:/);
    expect(childPush.state.frames[0]).toMatchObject({ status: "suspended", awaitingChildToken: childPush.resumeToken });
    expect(childPush.state.frames[0]!.window!.prompt).toBeNull();

    let child = advanceToLife(childPush.state, players);
    const childLife = applyDamageLifeFlow(child, players, { frameId: 2, expectedRevision: child.revision });
    players = childLife.players.map((player) => player.id === "b" ? { ...player, alive: false } : player);
    child = resumeDamageAfterDyingFlow(childLife.state, players, {
      frameId: 2,
      dyingId: childLife.dying!.dyingId,
      expectedRevision: childLife.state.revision,
      outcome: "dead",
    });
    child = completePostDamage(child, players);

    expectCode(() => finishDamageFlowFrame(child, {
      frameId: 2,
      resumeToken: "dfr1:999",
      expectedRevision: child.revision,
      players,
    }), "INVALID_RESUME_TOKEN");
    const returned = finishDamageFlowFrame(child, {
      frameId: 2,
      resumeToken: childPush.resumeToken,
      expectedRevision: child.revision,
      players,
    });
    expect(returned.resumedParentFrameId).toBe(1);
    expect(returned.callerContinuation).toBeNull();
    expect(returned.state.frames).toHaveLength(1);
    expect(returned.state.frames[0]!.window!.opportunities.map((entry) => entry.status)).toEqual(["skipped_dead", "pending"]);
    expect(currentDamageFlowPrompt(returned.state)).toMatchObject({ opportunityId: "c-global", ownerId: "c" });
    expect(currentDamageFlowPrompt(returned.state)!.promptId).not.toBe(oldParentPrompt.promptId);

    expectCode(() => actOnDamageOpportunity(returned.state, {
      ...actionFor(returned.state),
      promptId: oldParentPrompt.promptId,
      opportunityId: oldParentPrompt.opportunityId,
      ownerId: oldParentPrompt.ownerId,
    }), "PROMPT_REPLAY");
    expectCode(() => finishDamageFlowFrame(returned.state, {
      frameId: 1,
      resumeToken: childPush.resumeToken,
      expectedRevision: returned.state.revision,
      players,
    }), "RESUME_REPLAY");
  });

  it("round-trips a defensive root caller continuation and rejects forged persisted shapes", () => {
    const supplied = {
      type: "mass_attack.resume",
      data: {
        attackerId: "a",
        remainingTargetIds: ["b", "c"],
        context: { cardIds: ["slash-1"], optional: null },
      },
    };
    const state = pushDamageFlowFrame(createDamageFlowState(), {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: damage(),
      callerContinuation: supplied,
    }).state;
    supplied.data.remainingTargetIds.push("d");
    supplied.data.context.cardIds.push("forged");
    expect(top(state).callerContinuation).toEqual({
      type: "mass_attack.resume",
      data: {
        attackerId: "a",
        remainingTargetIds: ["b", "c"],
        context: { cardIds: ["slash-1"], optional: null },
      },
    });

    const serialized = serializeDamageFlowState(state);
    const restored = deserializeDamageFlowState(serialized);
    expect(restored).toEqual(state);
    expect(restored.frames[0]!.callerContinuation).not.toBe(state.frames[0]!.callerContinuation);

    const emptyType = JSON.parse(serialized) as DamageFlowState;
    Object.assign(emptyType.frames[0]!, { callerContinuation: { type: "", data: {} } });
    expectCode(() => restoreDamageFlowState(emptyType), "INVALID_STATE");
    expectCode(() => migrateDamageFlowState(emptyType), "INVALID_STATE");

    const arrayData = JSON.parse(serialized) as unknown as {
      frames: Array<{ callerContinuation: { type: string; data: unknown } }>;
    };
    arrayData.frames[0]!.callerContinuation.data = [];
    expectCode(() => restoreDamageFlowState(arrayData), "INVALID_STATE");

    const extraField = JSON.parse(serialized) as unknown as {
      frames: Array<{ callerContinuation: Record<string, unknown> }>;
    };
    extraField.frames[0]!.callerContinuation.forged = true;
    expectCode(() => restoreDamageFlowState(extraField), "INVALID_STATE");
  });

  it("forbids caller continuations on nested damage in both input and restored state", () => {
    const parent = pushDamageFlowFrame(createDamageFlowState(), {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: damage(),
      callerContinuation: { type: "slash.resume", data: { sourceId: "a" } },
    }).state;
    const nestedContinuation: DamageFlowCallerContinuation = {
      type: "forged.child.resume",
      data: { child: true },
    };
    expectCode(() => pushDamageFlowFrame(parent, {
      expectedParentFrameId: 1,
      expectedRevision: parent.revision,
      damage: damage({ damageId: 2, frameId: 2, sourceId: "b", targetId: "c" }),
      callerContinuation: nestedContinuation,
    }), "INVALID_ARGUMENT");

    const child = pushDamageFlowFrame(parent, {
      expectedParentFrameId: 1,
      expectedRevision: parent.revision,
      damage: damage({ damageId: 2, frameId: 2, sourceId: "b", targetId: "c" }),
    }).state;
    expect(child.frames[1]!.callerContinuation).toBeNull();
    const forged = structuredClone(child);
    Object.assign(forged.frames[1]!, { callerContinuation: nestedContinuation });
    expectCode(() => restoreDamageFlowState(forged), "INVALID_STATE");
  });

  it("returns a root caller continuation exactly once and rejects ledger replay", () => {
    const playersBefore = life();
    const continuation: DamageFlowCallerContinuation = {
      type: "slash_sequence.resume",
      data: { sourceId: "a", targetId: "b", useId: 7 },
    };
    let state = pushDamageFlowFrame(createDamageFlowState(), {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: damage(),
      callerContinuation: continuation,
    }).state;
    state = advanceToLife(state, playersBefore);
    const applied = applyDamageLifeFlow(state, playersBefore, {
      frameId: 1,
      expectedRevision: state.revision,
    });
    state = completePostDamage(applied.state, applied.players);
    const finished = finishDamageFlowFrame(state, {
      frameId: 1,
      resumeToken: null,
      expectedRevision: state.revision,
      players: null,
    });
    expect(finished.callerContinuation).toEqual(continuation);
    expect(finished.callerContinuation).not.toBe(continuation);
    expect(finished.state.completedFrameIds).toEqual([1]);
    expectCode(() => finishDamageFlowFrame(finished.state, {
      frameId: 1,
      resumeToken: null,
      expectedRevision: finished.state.revision,
      players: null,
    }), "RESUME_REPLAY");
  });

  it("round-trips a live prompt and rejects forged cursor, IDs, owner, stale revision, and replay", () => {
    const players = life();
    let state = pushRoot();
    state = openWindow(state, players, "causing_modifier", [
      ref({ id: "first", owner: "a", relation: "source" }),
      ref({ id: "second", owner: "c", relation: "global" }),
    ]);
    const serialized = serializeDamageFlowState(state);
    const restored = deserializeDamageFlowState(serialized);
    expect(restored).toEqual(state);
    restored.frames[0]!.damage.amount = 99;
    expect(top(state).damage.amount).toBe(1);

    const forgedSnapshot = JSON.parse(serialized) as DamageFlowState;
    forgedSnapshot.frames[0]!.window!.cursor = 1;
    expectCode(() => restoreDamageFlowState(forgedSnapshot), "INVALID_STATE");

    const valid = actionFor(state);
    expectCode(() => actOnDamageOpportunity(state, { ...valid, frameId: 99 }), "FRAME_NOT_TOP");
    expectCode(() => actOnDamageOpportunity(state, { ...valid, damageId: 99 }), "STALE_PROMPT");
    expectCode(() => actOnDamageOpportunity(state, { ...valid, windowId: 99 }), "STALE_PROMPT");
    expectCode(() => actOnDamageOpportunity(state, { ...valid, opportunityId: "forged" }), "STALE_PROMPT");
    expectCode(() => actOnDamageOpportunity(state, { ...valid, ownerId: "d" }), "WRONG_OWNER");
    expectCode(() => actOnDamageOpportunity(state, { ...valid, expectedRevision: state.revision - 1 }), "STALE_REVISION");
    expect(top(state).window!.opportunities.map((entry) => entry.status)).toEqual(["pending", "pending"]);

    const afterPass = actOnDamageOpportunity(state, valid);
    expect(top(afterPass).window!.opportunities[0]!.status).toBe("passed");
    expect(currentDamageFlowPrompt(afterPass)).toMatchObject({ opportunityId: "second", ownerId: "c" });
    expectCode(() => actOnDamageOpportunity(afterPass, valid), "ACTION_REPLAY");
    const resolved = actOnDamageOpportunity(afterPass, actionFor(afterPass, {
      outcome: "resolve",
      resolutionRef: "resolution:second",
      effect: { type: "modifier", operation: "add", value: 2 },
    }));
    expect(top(resolved).damage.amount).toBe(3);
    expect(top(resolved).window!.opportunities.map((entry) => entry.status)).toEqual(["passed", "resolved"]);
  });

  it("rejects duplicate IDs/opportunities and delegates redirect-cycle detection", () => {
    const players = life();
    let state = pushRoot();
    expectCode(() => pushDamageFlowFrame(state, {
      expectedParentFrameId: 1,
      expectedRevision: state.revision,
      damage: damage({ damageId: 1, frameId: 2 }),
    }), "DUPLICATE_DAMAGE_ID");
    expectCode(() => pushDamageFlowFrame(state, {
      expectedParentFrameId: 1,
      expectedRevision: state.revision,
      damage: damage({ damageId: 2, frameId: 1 }),
    }), "DUPLICATE_FRAME_ID");
    expect(top(state).status).toBe("active");

    const duplicate = ref({ id: "duplicate", owner: "a", relation: "source" });
    expectCode(() => openWindow(state, players, "causing_modifier", [duplicate, duplicate]), "INVALID_ARGUMENT");
    state = emptyWindow(state, players, "causing_modifier");
    state = openWindow(state, players, "redirect", [ref({ id: "to-c", owner: "b", relation: "target" })]);
    state = actOnDamageOpportunity(state, actionFor(state, {
      outcome: "resolve",
      resolutionRef: "redirect:b-c",
      effect: { type: "redirect", toTargetId: "c" },
    }));
    state = closeWindow(state);
    expect(top(state).step).toBe("redirect");
    expect(top(state).damage.targetId).toBe("c");

    state = openWindow(state, players, "redirect", [ref({ id: "back-to-b", owner: "c", relation: "target" })]);
    const cycleAction = actionFor(state, {
      outcome: "resolve",
      resolutionRef: "redirect:c-b",
      effect: { type: "redirect", toTargetId: "b" },
    });
    expectCode(() => actOnDamageOpportunity(state, cycleAction), "REDIRECT_CYCLE");
    expect(top(state).damage.targetId).toBe("c");
    expect(currentDamageFlowPrompt(state)?.opportunityId).toBe("back-to-b");
  });

  it("continues a valid redirect through the new target's receiving and life deduction", () => {
    const players = life();
    let state = emptyWindow(pushRoot(), players, "causing_modifier");
    state = openWindow(state, players, "redirect", [
      ref({ id: "valid-to-c", owner: "b", relation: "target" }),
    ]);
    state = actOnDamageOpportunity(state, actionFor(state, {
      outcome: "resolve",
      resolutionRef: "redirect:b-c:valid",
      effect: { type: "redirect", toTargetId: "c" },
    }));
    state = closeWindow(state);
    expect(top(state)).toMatchObject({ step: "redirect", damage: { targetId: "c", stage: "receiving" } });

    state = emptyWindow(state, players, "redirect");
    expect(top(state).step).toBe("receiving");
    state = emptyWindow(state, players, "receiving_modifier");
    expect(top(state).step).toBe("life_deduction");
    const applied = applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision });
    expect(applied.application).toMatchObject({ targetId: "c", hpBefore: 4, hpAfter: 3, amount: 1 });
    expect(applied.players.find((player) => player.id === "b")?.hp).toBe(4);
    expect(applied.players.find((player) => player.id === "c")?.hp).toBe(3);
    expect(top(applied.state).damage.stage).toBe("source_after_once");
  });

  it("prevents damage without life loss or source/target after-damage windows", () => {
    const players = life();
    let state = openWindow(pushRoot(damage({ amount: 3 })), players, "causing_modifier", [
      ref({ id: "prevent", owner: "a", relation: "source" }),
      ref({ id: "skipped-after-prevent", owner: "c", relation: "global" }),
    ]);
    state = actOnDamageOpportunity(state, actionFor(state, {
      outcome: "resolve",
      resolutionRef: "prevent:all",
      effect: { type: "prevention", reason: "test prevention" },
    }));
    expect(top(state).window!.opportunities.map((entry) => entry.status)).toEqual(["resolved", "skipped_prevented"]);
    expect(top(state).damage).toMatchObject({ amount: 0, stage: "settlement_end" });
    state = closeWindow(state);
    expect(top(state)).toMatchObject({ step: "post_damage", damage: { stage: "settlement_end" } });
    expectCode(() => applyDamageLifeFlow(state, players, { frameId: 1, expectedRevision: state.revision }), "DAMAGE_NOT_READY");
    expectCode(() => openWindow(state, players, "source_after_once"), "WRONG_WINDOW");
    expect(players.map((player) => player.hp)).toEqual([4, 4, 4, 4]);
    state = emptyWindow(state, players, "settlement_end");
    expect(top(state).step).toBe("complete");
  });

  it("migrates only an unambiguous empty v0 boundary", () => {
    const migrated = migrateDamageFlowState({
      version: 0,
      type: "damage_flow",
      revision: 7,
      activeDamage: null,
      completedDamageIds: [4],
      completedFrameIds: [8],
    });
    expect(migrated).toMatchObject({ version: 1, revision: 7, completedDamageIds: [4], completedFrameIds: [8], frames: [] });
    expectCode(() => migrateDamageFlowState({
      version: 0,
      type: "damage_flow",
      revision: 7,
      activeDamage: { stage: "receiving" },
      completedDamageIds: [],
      completedFrameIds: [],
    }), "AMBIGUOUS_MIGRATION");

    const liveV1 = pushRoot();
    const legacyV1 = structuredClone(liveV1) as unknown as {
      version: 1;
      frames: Array<Record<string, unknown>>;
    };
    delete legacyV1.frames[0]!.callerContinuation;
    expectCode(() => restoreDamageFlowState(legacyV1), "INVALID_STATE");
    expect(migrateDamageFlowState(legacyV1).frames[0]!.callerContinuation).toBeNull();
  });
});
