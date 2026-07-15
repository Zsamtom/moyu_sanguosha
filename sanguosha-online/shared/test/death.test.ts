import { describe, expect, it } from "vitest";

import type { Card } from "../src/types.js";
import {
  DeathFrameError,
  assertDeathFrame,
  assertDeathStack,
  cloneDeathFrame,
  cloneDeathStack,
  completeDeathAfter,
  completeDeathCardDisposition,
  completeDeathRewardPunishment,
  completeDeathTriggers,
  createDeathFrame,
  createDeathStack,
  popCompletedDeathFrame,
  pushDeathFrame,
  revealDeathIdentity,
} from "../src/engine/death.js";
import type { DeathEvent } from "../src/engine/dying.js";
import type { MoveReason, MoveRecord, ZoneRef } from "../src/engine/zones.js";

function card(id: string): Card {
  return { id, kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7 } as Card;
}

function move(
  batchId: number,
  cardIds: readonly string[],
  from: ZoneRef,
  to: ZoneRef,
  reason: MoveReason,
): MoveRecord {
  return {
    batchId,
    cardIds: [...cardIds],
    cards: cardIds.map(card),
    from,
    to,
    reason,
    visibility: "public",
  };
}

function death(victimId = "victim", killerId: string | null = "killer", eventId = 1): DeathEvent {
  return {
    type: "death",
    eventId,
    victimId,
    killerId,
    reason: { type: "damage", eventId: eventId + 100, sourceId: killerId },
  };
}

describe("recoverable death frame", () => {
  it("runs every persisted death stage exactly once, including Xingshang and rebel bounty", () => {
    const frame = createDeathFrame({
      frameId: 10,
      death: death(),
      ownedPhysicalCardIds: ["victim-hand", "victim-weapon"],
    });
    revealDeathIdentity(frame, { eventId: 2, role: "rebel" });
    expect(() => revealDeathIdentity(frame, { eventId: 3, role: "rebel" })).toThrow(/expected identity_reveal/);
    expect(() => completeDeathTriggers(frame, { eventId: 2 })).toThrow(/already consumed/);
    completeDeathTriggers(frame, { eventId: 3, consumedTriggerIds: ["death:trigger:1"] });
    completeDeathCardDisposition(frame, {
      eventId: 4,
      xingshangRecipientId: "collector",
      moveRecords: [
        move(1, ["victim-hand"], { kind: "hand", playerId: "victim" }, { kind: "hand", playerId: "collector" }, "skill_effect"),
        move(1, ["victim-weapon"], { kind: "equipment", playerId: "victim", slot: "weapon" }, { kind: "hand", playerId: "collector" }, "skill_effect"),
      ],
    });
    completeDeathRewardPunishment(frame, {
      eventId: 5,
      kind: "rebel_bounty",
      affectedPlayerId: "killer",
      moveRecords: [move(2, ["draw-1", "draw-2", "draw-3"], { kind: "deck" }, { kind: "hand", playerId: "killer" }, "draw")],
    });
    completeDeathAfter(frame, { eventId: 6, consumedTriggerIds: ["death:after:1"] });

    expect(frame.stage).toBe("complete");
    expect(frame.cardDisposition).toMatchObject({ xingshangRecipientId: "collector" });
    expect(frame.rewardPunishment).toMatchObject({ kind: "rebel_bounty", affectedPlayerId: "killer" });
    expect(() => completeDeathAfter(frame, { eventId: 7 })).toThrow(/expected death_after/);
    expect(() => assertDeathFrame(frame)).not.toThrow();
  });

  it("rejects partial or forged card disposition and reward provenance", () => {
    const frame = createDeathFrame({
      frameId: 1,
      death: death(),
      ownedPhysicalCardIds: ["hand", "armor"],
    });
    revealDeathIdentity(frame, { eventId: 2, role: "rebel" });
    completeDeathTriggers(frame, { eventId: 3 });
    expect(() => completeDeathCardDisposition(frame, {
      eventId: 4,
      moveRecords: [move(1, ["hand"], { kind: "hand", playerId: "victim" }, { kind: "discard" }, "death")],
    })).toThrow(/exact owned-card snapshot/);
    expect(frame.stage).toBe("card_disposition");
    completeDeathCardDisposition(frame, {
      eventId: 4,
      moveRecords: [
        move(1, ["hand"], { kind: "hand", playerId: "victim" }, { kind: "discard" }, "death"),
        move(1, ["armor"], { kind: "equipment", playerId: "victim", slot: "armor" }, { kind: "discard" }, "death"),
      ],
    });
    expect(() => completeDeathRewardPunishment(frame, {
      eventId: 5,
      kind: "rebel_bounty",
      affectedPlayerId: "killer",
      moveRecords: [move(2, ["only-two", "draw-2"], { kind: "deck" }, { kind: "hand", playerId: "killer" }, "draw")],
    })).toThrow(/exactly three/);
    expect(frame.stage).toBe("reward_punishment");
  });

  it("restores midway without replaying completed stages", () => {
    const original = createDeathFrame({ frameId: 4, death: death("victim", null), ownedPhysicalCardIds: [] });
    revealDeathIdentity(original, { eventId: 10, role: "renegade", wasAlreadyRevealed: true });
    completeDeathTriggers(original, { eventId: 11, consumedTriggerIds: ["trigger-a"] });
    const restored = cloneDeathFrame(JSON.parse(JSON.stringify(original)) as typeof original);
    expect(restored).toEqual(original);
    expect(restored.death).not.toBe(original.death);
    expect(() => revealDeathIdentity(restored, { eventId: 12, role: "renegade" })).toThrow(/expected identity_reveal/);
    completeDeathCardDisposition(restored, { eventId: 12, moveRecords: [] });
    completeDeathRewardPunishment(restored, { eventId: 13, kind: "none" });
    completeDeathAfter(restored, { eventId: 14 });
    expect(restored.stage).toBe("complete");
    expect(original.stage).toBe("card_disposition");
    expect(() => assertDeathFrame(restored)).not.toThrow();

    const forged = cloneDeathFrame(restored);
    forged.deathAfter = null;
    expect(() => assertDeathFrame(forged)).toThrow(/progress/);
  });

  it("suspends a parent death while a nested death completes, then resumes it", () => {
    const stack = createDeathStack();
    const parent = createDeathFrame({ frameId: 1, death: death("parent", null, 20) });
    revealDeathIdentity(parent, { eventId: 21, role: "renegade" });
    pushDeathFrame(stack, parent);

    const child = createDeathFrame({ frameId: 2, death: death("child", null, 30) });
    pushDeathFrame(stack, child);
    expect(parent.suspendedByFrameId).toBe(2);
    expect(() => completeDeathTriggers(parent, { eventId: 22 })).toThrow(/stack top/);

    revealDeathIdentity(child, { eventId: 31, role: "renegade" });
    completeDeathTriggers(child, { eventId: 32 });
    completeDeathCardDisposition(child, { eventId: 33 });
    completeDeathRewardPunishment(child, { eventId: 34, kind: "none" });
    completeDeathAfter(child, { eventId: 35 });
    popCompletedDeathFrame(stack, child.frameId);

    expect(parent.suspendedByFrameId).toBeNull();
    completeDeathTriggers(parent, { eventId: 22 });
    expect(parent.stage).toBe("card_disposition");
    expect(() => assertDeathStack(stack)).not.toThrow();
    const restored = cloneDeathStack(JSON.parse(JSON.stringify(stack)) as typeof stack);
    expect(restored).toEqual(stack);
    expect(restored.frames[0]).not.toBe(stack.frames[0]);
  });

  it("validates lord-loyalist punishment provenance", () => {
    const frame = createDeathFrame({ frameId: 9, death: death("loyalist", "lord") });
    revealDeathIdentity(frame, { eventId: 2, role: "loyalist" });
    completeDeathTriggers(frame, { eventId: 3 });
    completeDeathCardDisposition(frame, { eventId: 4 });
    completeDeathRewardPunishment(frame, {
      eventId: 5,
      kind: "lord_loyalist_penalty",
      affectedPlayerId: "lord",
      moveRecords: [move(5, ["lord-hand"], { kind: "hand", playerId: "lord" }, { kind: "discard" }, "death")],
    });
    expect(frame.stage).toBe("death_after");
    expect(() => assertDeathFrame(frame)).not.toThrow();

    const corrupted = cloneDeathFrame(frame);
    corrupted.rewardPunishment = { ...corrupted.rewardPunishment!, affectedPlayerId: "other" };
    expect(() => assertDeathFrame(corrupted)).toThrow(DeathFrameError);
  });
});
