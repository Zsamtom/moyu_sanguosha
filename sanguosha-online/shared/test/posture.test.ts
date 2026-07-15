import { describe, expect, it } from "vitest";

import type { TurnEntry } from "../src/engine/resolution.js";
import {
  PostureError,
  assertPostureEngineState,
  clonePostureEngineState,
  createPostureEngineState,
  migratePostureEngineState,
  prepareTurnEntryStart,
  restorePostureEngineState,
  turnOverPlayer,
} from "../src/engine/posture.js";

function turn(
  turnId: number,
  playerId: string,
  kind: "normal" | "extra" = "normal",
): TurnEntry {
  return {
    turnId,
    playerId,
    kind,
    grantedByTurnId: kind === "extra" ? 1 : null,
    reason: { type: kind === "extra" ? "lianpo" : "seat_order", data: {} },
    queuedAtStateVersion: turnId + 1,
  };
}

function expectCode(action: () => unknown, code: PostureError["code"]): void {
  try {
    action();
    throw new Error("expected posture operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PostureError);
    expect((error as PostureError).code).toBe(code);
  }
}

describe("authoritative player posture", () => {
  it("starts a normal turn while face up and atomically skips it while face down", () => {
    const initial = createPostureEngineState(["a", "b"]);
    const started = prepareTurnEntryStart(initial, turn(1, "a"));
    expect(started.disposition).toBe("start_turn");
    expect(started.turnOverEvent).toBeNull();
    expect(initial.consumedTurns).toEqual([]);

    const faceDown = turnOverPlayer(started.state, {
      playerId: "a",
      turnId: 1,
      reason: { type: "fangzhu", data: { sourcePlayerId: "b" } },
    });
    expect(faceDown.event).toMatchObject({ faceUpBefore: true, faceUpAfter: false, cause: "explicit" });

    const skipped = prepareTurnEntryStart(faceDown.state, turn(2, "a"));
    expect(skipped.disposition).toBe("skip_entire_turn");
    expect(skipped.state.players.find((player) => player.playerId === "a")?.faceUp).toBe(true);
    expect(skipped.turnOverEvent).toMatchObject({
      cause: "face_down_turn_start",
      turnId: 2,
      faceUpBefore: false,
      faceUpAfter: true,
    });
    expect(skipped.state.consumedTurns.at(-1)).toMatchObject({
      disposition: "skip_entire_turn",
      turn: { turnId: 2, kind: "normal" },
    });
    expect(() => assertPostureEngineState(skipped.state)).not.toThrow();
  });

  it("applies the same exact-once face-down rule to extra turns", () => {
    let state = createPostureEngineState(["a", "b"]);
    state = turnOverPlayer(state, {
      playerId: "b",
      reason: { type: "fangzhu", data: {} },
    }).state;
    const skipped = prepareTurnEntryStart(state, turn(3, "b", "extra"));
    expect(skipped.disposition).toBe("skip_entire_turn");
    expect(skipped.turn.kind).toBe("extra");
    expect(skipped.turnOverEvent?.reason).toMatchObject({
      type: "posture.face_down_turn_start",
      data: { turnId: 3, turnKind: "extra", turnReason: { type: "lianpo" } },
    });

    const following = prepareTurnEntryStart(skipped.state, turn(4, "b", "extra"));
    expect(following.disposition).toBe("start_turn");
    expect(following.turnOverEvent).toBeNull();
  });

  it("restores JSON snapshots and explicitly migrates old orientation-only rooms", () => {
    const oldSnapshot = {
      version: 0,
      players: [
        { playerId: "a", faceUp: false },
        { playerId: "b", faceUp: true },
      ],
    } as const;
    const migrated = migratePostureEngineState(oldSnapshot);
    expect(migrated.players).toEqual([
      { playerId: "a", faceUp: false },
      { playerId: "b", faceUp: true },
    ]);
    expect(migrated.events[0]).toMatchObject({ cause: "legacy_migration", playerId: "a" });

    const restored = restorePostureEngineState(JSON.parse(JSON.stringify(migrated)) as unknown);
    const cloned = clonePostureEngineState(restored);
    expect(cloned).toEqual(migrated);
    expect(cloned).not.toBe(migrated);
    expect(cloned.events[0]).not.toBe(migrated.events[0]);

    const skipped = prepareTurnEntryStart(restored, turn(7, "a"));
    const resumed = migratePostureEngineState(JSON.parse(JSON.stringify(skipped.state)) as unknown);
    expect(resumed.consumedTurns).toHaveLength(1);
    expect(resumed.players[0]?.faceUp).toBe(true);
    expect(migratePostureEngineState(undefined, ["new-a", "new-b"]).players).toHaveLength(2);
  });

  it("rejects forged posture, event linkage, player IDs, and non-JSON reasons", () => {
    expect(() => createPostureEngineState(["a", "a"])).toThrow(/unique/);
    const base = createPostureEngineState(["a", "b"]);
    expectCode(() => prepareTurnEntryStart(base, turn(1, "intruder")), "UNKNOWN_PLAYER");
    expectCode(() => turnOverPlayer(base, {
      playerId: "a",
      reason: { type: "forged", data: { resume: (() => undefined) as never } },
    }), "INVALID_ARGUMENT");

    const down = turnOverPlayer(base, { playerId: "a", reason: { type: "fangzhu", data: {} } }).state;
    const skipped = prepareTurnEntryStart(down, turn(2, "a")).state;
    const forgedFace = structuredClone(skipped) as typeof skipped;
    forgedFace.players[0]!.faceUp = false;
    expectCode(() => assertPostureEngineState(forgedFace), "INVALID_STATE");

    const forgedLink = structuredClone(skipped) as unknown as {
      consumedTurns: Array<{ turnOverEventId: number | null }>;
      events: Array<{ eventId: number }>;
    };
    forgedLink.consumedTurns[0]!.turnOverEventId = forgedLink.events[0]!.eventId;
    expectCode(() => assertPostureEngineState(forgedLink), "INVALID_STATE");
  });

  it("rejects duplicate or stale turn IDs without consuming posture twice", () => {
    let state = createPostureEngineState(["a", "b"]);
    state = turnOverPlayer(state, { playerId: "a", reason: { type: "fangzhu", data: {} } }).state;
    const once = prepareTurnEntryStart(state, turn(5, "a"));
    const snapshot = clonePostureEngineState(once.state);

    expectCode(() => prepareTurnEntryStart(once.state, turn(5, "a")), "TURN_ALREADY_CONSUMED");
    expectCode(() => prepareTurnEntryStart(once.state, turn(5, "b", "extra")), "TURN_ALREADY_CONSUMED");
    expect(once.state).toEqual(snapshot);
    expect(once.state.events).toHaveLength(2);
    expect(once.state.players[0]?.faceUp).toBe(true);
  });
});
