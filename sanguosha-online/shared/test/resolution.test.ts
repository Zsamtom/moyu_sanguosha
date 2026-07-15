import { describe, expect, it } from "vitest";

import {
  ResolutionError,
  beginPhaseInstance,
  cloneResolutionStack,
  cloneJsonObject,
  consumeDecision,
  createResolutionStack,
  deserializeResolutionStack,
  endPhaseInstance,
  enqueueTurn,
  finishCurrentTurn,
  popFrame,
  pushFrame,
  replaceTopFrame,
  restoreResolutionStack,
  resumeTopFrame,
  serializeResolutionStack,
  startNextTurn,
  updateTopFrameData,
  validateResolutionStack,
  waitForDecision,
  type DecisionAction,
  type ResolutionErrorCode,
  type ResolutionStack,
} from "../src/engine/resolution.js";

function expectCode(run: () => unknown, code: ResolutionErrorCode): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ResolutionError);
    expect((error as ResolutionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ResolutionError(${code}).`);
}

function withActiveTurn(playerId = "player-a"): ResolutionStack {
  let stack = createResolutionStack();
  stack = enqueueTurn(stack, { playerId, kind: "normal" }).stack;
  stack = startNextTurn(stack).stack;
  return stack;
}

function actionFor(
  stack: ResolutionStack,
  request: { requestId: number; frameId: number; actorId: string; issuedAtStateVersion: number },
  value: DecisionAction["value"],
): DecisionAction {
  return {
    actionId: stack.nextActionId,
    requestId: request.requestId,
    frameId: request.frameId,
    actorId: request.actorId,
    expectedStateVersion: request.issuedAtStateVersion,
    value,
  };
}

describe("serializable resolution core", () => {
  it("pauses only the top frame, restores a consumed decision, and resumes each parent exactly once", () => {
    let stack = withActiveTurn();
    const phasePush = pushFrame(stack, null, {
      kind: "phase",
      phase: { turnId: stack.turnQueue.current!.turnId, playerId: "player-a", name: "prepare" },
      continuation: { type: "phase_cursor", data: { next: "judgment" } },
    });
    stack = beginPhaseInstance(phasePush.stack, phasePush.frame.frameId);

    const childPush = pushFrame(stack, phasePush.frame.frameId, {
      kind: "skill",
      payload: { skillId: "luoshen", iteration: 1 },
      continuation: { type: "phase_cursor", data: { phase: "prepare" } },
    });
    stack = childPush.stack;
    expect(stack.frames.map((frame) => frame.status)).toEqual(["suspended", "active"]);
    expectCode(() => waitForDecision(stack, {
      frameId: phasePush.frame.frameId,
      actorId: "player-a",
      kind: "skill_choice",
    }), "FRAME_NOT_TOP");

    const waiting = waitForDecision(stack, {
      frameId: childPush.frame.frameId,
      actorId: "player-a",
      kind: "skill_choice",
      canPass: true,
      payload: { skillId: "luoshen", iteration: 1 },
    });
    stack = waiting.stack;
    expect(stack.frames.at(-1)).toMatchObject({
      status: "waiting",
      decisionRequest: { requestId: waiting.request.requestId, actorId: "player-a" },
    });
    expectCode(() => waitForDecision(stack, {
      frameId: childPush.frame.frameId,
      actorId: "player-a",
      kind: "duplicate_prompt",
    }), "FRAME_HAS_PENDING_DECISION");
    expectCode(() => enqueueTurn(stack, {
      playerId: "player-a",
      kind: "extra",
    }), "FRAME_HAS_PENDING_DECISION");

    const validAction = actionFor(stack, waiting.request, { activate: true });
    expectCode(() => consumeDecision(stack, {
      ...validAction,
      frameId: phasePush.frame.frameId,
    }), "FRAME_NOT_TOP");
    expectCode(() => consumeDecision(stack, { ...validAction, actorId: "player-b" }), "WRONG_ACTOR");
    expectCode(() => consumeDecision(stack, {
      ...validAction,
      expectedStateVersion: validAction.expectedStateVersion - 1,
    }), "STALE_STATE");
    expect(stack.nextActionId).toBe(1);

    const accepted = consumeDecision(stack, validAction);
    expect(accepted.kind).toBe("accepted");
    stack = accepted.stack;
    expect(stack.frames.at(-1)?.status).toBe("ready");
    expectCode(() => enqueueTurn(stack, {
      playerId: "player-a",
      kind: "extra",
    }), "FRAME_HAS_PENDING_DECISION");

    const restored = deserializeResolutionStack(serializeResolutionStack(stack));
    expect(restored).toEqual(stack);
    expect(restored).not.toBe(stack);
    const duplicate = consumeDecision(restored, validAction);
    expect(duplicate.kind).toBe("duplicate");
    expect(duplicate.stack.stateVersion).toBe(restored.stateVersion);
    expect(duplicate.resolution.action.value).toEqual({ activate: true });

    const resumed = resumeTopFrame(restored, childPush.frame.frameId, waiting.request.requestId, {
      payload: { skillId: "luoshen", iteration: 1, choiceApplied: true },
    });
    expect(resumed.resolution.action).toEqual(validAction);
    expect(resumed.stack.frames.at(-1)?.payload).toMatchObject({ choiceApplied: true });
    stack = popFrame(resumed.stack, childPush.frame.frameId).stack;
    expect(stack.frames).toHaveLength(1);
    expect(stack.frames[0]).toMatchObject({ frameId: phasePush.frame.frameId, status: "active" });

    stack = endPhaseInstance(stack, phasePush.frame.frameId);
    expectCode(() => endPhaseInstance(stack, phasePush.frame.frameId), "PHASE_ALREADY_ENDED");
    stack = popFrame(stack, phasePush.frame.frameId).stack;
    expect(stack.frames).toEqual([]);
    stack = finishCurrentTurn(stack, stack.turnQueue.current!.turnId).stack;
    expect(stack.turnQueue.current).toBeNull();
  });

  it("rejects stale decisions, action ID collisions, and out-of-sequence actions", () => {
    let stack = pushFrame(createResolutionStack(), null, {
      kind: "skill",
      payload: { skillId: "test" },
    }).stack;
    const frameId = stack.frames.at(-1)!.frameId;
    const firstPrompt = waitForDecision(stack, {
      frameId,
      actorId: "player-a",
      kind: "confirm",
    });
    stack = firstPrompt.stack;
    const firstAction = actionFor(stack, firstPrompt.request, true);
    stack = consumeDecision(stack, firstAction).stack;

    expectCode(() => consumeDecision(stack, { ...firstAction, value: false }), "ACTION_ID_REUSED");
    stack = resumeTopFrame(stack, frameId, firstPrompt.request.requestId).stack;
    const secondPrompt = waitForDecision(stack, {
      frameId,
      actorId: "player-a",
      kind: "confirm_again",
    });
    stack = secondPrompt.stack;

    expectCode(() => consumeDecision(stack, {
      actionId: stack.nextActionId + 1,
      requestId: secondPrompt.request.requestId,
      frameId,
      actorId: "player-a",
      expectedStateVersion: secondPrompt.request.issuedAtStateVersion,
      value: true,
    }), "ACTION_OUT_OF_SEQUENCE");
    expectCode(() => consumeDecision(stack, {
      actionId: stack.nextActionId,
      requestId: firstPrompt.request.requestId,
      frameId,
      actorId: "player-a",
      expectedStateVersion: secondPrompt.request.issuedAtStateVersion,
      value: true,
    }), "STALE_DECISION");

    const secondAction = actionFor(stack, secondPrompt.request, false);
    const accepted = consumeDecision(stack, secondAction);
    expect(accepted.kind).toBe("accepted");
    expect(accepted.stack.nextActionId).toBe(3);
    expect(accepted.stack.consumedActions.map((entry) => entry.action.actionId)).toEqual([1, 2]);
  });

  it("allocates monotonic frame and state versions across push, replace, pop, and a new root", () => {
    let stack = createResolutionStack();
    const versions = [stack.stateVersion];
    const first = pushFrame(stack, null, {
      kind: "card_use",
      continuation: { type: "card_use", data: { useId: 7, remainingTargets: ["player-b"] } },
    });
    stack = first.stack;
    versions.push(stack.stateVersion);

    const updated = updateTopFrameData(stack, first.frame.frameId, {
      payload: cloneJsonObject({
        cardUse: { useId: 7, stage: "targets_confirmed", targetIds: ["player-b"] },
      }),
    });
    stack = updated.stack;
    versions.push(stack.stateVersion);
    expect(updated.frame.payload).toMatchObject({ cardUse: { stage: "targets_confirmed" } });

    const replaced = replaceTopFrame(stack, first.frame.frameId, {
      kind: "damage",
      payload: { sourceId: "player-a", targetId: "player-b", amount: 1 },
    });
    stack = replaced.stack;
    versions.push(stack.stateVersion);
    expect(replaced.frame.frameId).toBeGreaterThan(first.frame.frameId);
    expectCode(() => replaceTopFrame(stack, first.frame.frameId, { kind: "skill" }), "FRAME_NOT_TOP");

    stack = popFrame(stack, replaced.frame.frameId).stack;
    versions.push(stack.stateVersion);
    const newRoot = pushFrame(stack, null, { kind: "judgment" });
    stack = newRoot.stack;
    versions.push(stack.stateVersion);
    expect(newRoot.frame.frameId).toBeGreaterThan(replaced.frame.frameId);
    expect(stack.nextFrameId).toBe(newRoot.frame.frameId + 1);
    expect(versions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("enforces phase begin/end ordering and active-turn ownership", () => {
    const empty = createResolutionStack();
    expectCode(() => pushFrame(empty, null, {
      kind: "phase",
      phase: { turnId: 1, playerId: "player-a", name: "draw" },
    }), "TURN_MISMATCH");

    let stack = withActiveTurn();
    const phase = pushFrame(stack, null, {
      kind: "phase",
      phase: { turnId: stack.turnQueue.current!.turnId, playerId: "player-a", name: "draw" },
    });
    stack = phase.stack;
    expectCode(() => endPhaseInstance(stack, phase.frame.frameId), "PHASE_NOT_BEGUN");
    expectCode(() => waitForDecision(stack, {
      frameId: phase.frame.frameId,
      actorId: "player-a",
      kind: "draw_replacement",
    }), "PHASE_NOT_BEGUN");
    expectCode(() => popFrame(stack, phase.frame.frameId), "PHASE_NOT_ENDED");

    stack = beginPhaseInstance(stack, phase.frame.frameId);
    const begunVersion = stack.stateVersion;
    expect(stack.frames[0]).toMatchObject({
      phase: { lifecycle: "begun", beganAtStateVersion: begunVersion, endedAtStateVersion: null },
    });
    expectCode(() => beginPhaseInstance(stack, phase.frame.frameId), "PHASE_ALREADY_BEGUN");
    stack = endPhaseInstance(stack, phase.frame.frameId);
    expect(stack.frames[0]).toMatchObject({
      phase: { lifecycle: "ended", beganAtStateVersion: begunVersion, endedAtStateVersion: stack.stateVersion },
    });
    expectCode(() => pushFrame(stack, phase.frame.frameId, { kind: "skill" }), "PHASE_ALREADY_ENDED");

    const nextPhase = replaceTopFrame(stack, phase.frame.frameId, {
      kind: "phase",
      phase: { turnId: stack.turnQueue.current!.turnId, playerId: "player-a", name: "play" },
    });
    expect(nextPhase.frame.frameId).toBeGreaterThan(phase.frame.frameId);
    expect(nextPhase.frame).toMatchObject({ phase: { lifecycle: "created", name: "play" } });
  });

  it("keeps extra turns explicit and FIFO ahead of already queued normal turns", () => {
    let stack = createResolutionStack();
    stack = enqueueTurn(stack, { playerId: "player-a", kind: "normal" }).stack;
    stack = startNextTurn(stack).stack;
    const activeTurnId = stack.turnQueue.current!.turnId;
    stack = enqueueTurn(stack, { playerId: "player-b", kind: "normal" }).stack;
    stack = enqueueTurn(stack, { playerId: "player-c", kind: "normal" }).stack;
    const extraA = enqueueTurn(stack, {
      playerId: "player-a",
      kind: "extra",
      reason: { type: "lianpo", data: { sourceSkill: "lianpo" } },
    });
    stack = extraA.stack;
    const extraB = enqueueTurn(stack, {
      playerId: "player-d",
      kind: "extra",
      reason: { type: "fangquan", data: { sourceSkill: "fangquan" } },
    });
    stack = extraB.stack;

    expect(stack.turnQueue.pending.map((turn) => [turn.kind, turn.playerId])).toEqual([
      ["extra", "player-a"],
      ["extra", "player-d"],
      ["normal", "player-b"],
      ["normal", "player-c"],
    ]);
    expect(extraA.turn.grantedByTurnId).toBe(activeTurnId);
    expect(extraB.turn.grantedByTurnId).toBe(activeTurnId);
    expectCode(() => startNextTurn(stack), "TURN_ALREADY_ACTIVE");
    expectCode(() => finishCurrentTurn(stack, activeTurnId + 999), "TURN_MISMATCH");

    const liveFrame = pushFrame(stack, null, { kind: "extra_turn" });
    expectCode(() => finishCurrentTurn(liveFrame.stack, activeTurnId), "RESOLUTION_IN_PROGRESS");
    stack = popFrame(liveFrame.stack, liveFrame.frame.frameId).stack;
    stack = finishCurrentTurn(stack, activeTurnId).stack;

    const order: string[] = [];
    while (stack.turnQueue.pending.length > 0) {
      const started = startNextTurn(stack);
      stack = started.stack;
      order.push(started.turn.playerId);
      stack = finishCurrentTurn(stack, started.turn.turnId).stack;
    }
    expect(order).toEqual(["player-a", "player-d", "player-b", "player-c"]);
    expectCode(() => startNextTurn(stack), "NO_QUEUED_TURN");
  });

  it("models death as its own nestable resolution frame", () => {
    const damage = pushFrame(createResolutionStack(), null, { kind: "damage" });
    const dying = pushFrame(damage.stack, damage.frame.frameId, { kind: "dying" });
    const death = replaceTopFrame(dying.stack, dying.frame.frameId, { kind: "death" });

    expect(death.stack.frames).toMatchObject([
      { frameId: damage.frame.frameId, kind: "damage", status: "suspended" },
      { frameId: death.frame.frameId, kind: "death", status: "active" },
    ]);
    expect(death.frame.frameId).toBeGreaterThan(dying.frame.frameId);
    expect(() => restoreResolutionStack(JSON.parse(JSON.stringify(death.stack)))).not.toThrow();
  });

  it("deep-clones valid snapshots and rejects malformed or non-JSON structures", () => {
    let stack = pushFrame(createResolutionStack(), null, {
      kind: "trigger_window",
      payload: { eventId: 10, triggers: [{ triggerId: "10:jizhi:player-a:0" }] },
    }).stack;
    const cloned = cloneResolutionStack(stack);
    expect(cloned).toEqual(stack);
    expect(cloned).not.toBe(stack);
    expect(cloned.frames[0]).not.toBe(stack.frames[0]);

    const malformed = structuredClone(stack) as unknown as Record<string, unknown>;
    const malformedFrames = malformed.frames as Array<Record<string, unknown>>;
    malformedFrames[0]!.status = "suspended";
    const validation = validateResolutionStack(malformed);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.message.includes("top frame"))).toBe(true);
    expectCode(() => restoreResolutionStack(malformed), "INVALID_STACK");

    const nonJson = structuredClone(stack) as unknown as {
      frames: Array<{ payload: Record<string, unknown> }>;
    };
    nonJson.frames[0]!.payload.resume = () => undefined;
    expectCode(() => restoreResolutionStack(nonJson), "INVALID_STACK");
    expectCode(() => deserializeResolutionStack("{not-json"), "INVALID_STACK");

    stack = waitForDecision(stack, {
      frameId: stack.frames[0]!.frameId,
      actorId: "player-a",
      kind: "trigger_choice",
    }).stack;
    expect(validateResolutionStack(stack)).toMatchObject({ valid: true, issues: [] });
    const crossedBarrier = structuredClone(stack);
    crossedBarrier.stateVersion += 1;
    expect(validateResolutionStack(crossedBarrier)).toMatchObject({ valid: false });
    expect(validateResolutionStack(crossedBarrier).issues.some((issue) =>
      issue.message.includes("latest state transition")
    )).toBe(true);
  });
});
