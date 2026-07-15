import { describe, expect, it } from "vitest";

import type { Card } from "../src/types.js";
import type { LifePlayerState } from "../src/engine/damage.js";
import {
  DyingError,
  applyAlternateSave,
  applyDyingOwnerResponseSave,
  assertDyingFrame,
  assertDyingStack,
  canConfirmDeath,
  cloneDyingFrame,
  cloneDyingStack,
  confirmDeath,
  createDyingFrame,
  createDyingStack,
  currentDyingEntrySaveSkill,
  currentDyingOwnerResponseSkill,
  currentDyingResponder,
  declineDyingOwnerResponseSave,
  migrateDyingFrame,
  passDyingRescue,
  playDyingRescueCard,
  popResolvedDyingFrame,
  pushDyingFrame,
  resolveDyingEntrySave,
  type LegacyDyingFrameV1,
} from "../src/engine/dying.js";
import type { AtomicZoneState, ZoneRef } from "../src/engine/zones.js";

function card(id: string, kind: "peach" | "wine" | "slash", suit: Card["suit"] = "heart"): Card {
  return { id, kind, name: "杀", category: "basic", suit, rank: 7 } as Card;
}

function life(victimHp = -1): LifePlayerState[] {
  return [
    { id: "current", hp: 4, maxHp: 4, alive: true },
    { id: "victim", hp: victimHp, maxHp: 3, alive: true },
    { id: "helper", hp: 3, maxHp: 4, alive: true },
    { id: "nested", hp: 0, maxHp: 3, alive: true },
  ];
}

function zones(): AtomicZoneState {
  return {
    deck: [],
    discard: [],
    processing: {},
    players: [
      {
        id: "current",
        hand: [card("peach-1", "peach"), card("peach-2", "peach"), card("jijiu-red", "slash", "diamond"), card("jijiu-black", "slash", "spade")],
        equipment: {},
        judgment: [],
        extraPiles: {},
      },
      { id: "victim", hand: [card("self-wine", "wine")], equipment: {}, judgment: [], extraPiles: {} },
      { id: "helper", hand: [], equipment: {}, judgment: [], extraPiles: {} },
      { id: "nested", hand: [], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

function frame(players: LifePlayerState[], input: {
  frameId?: number;
  victimId?: string;
  entrySaveSkillIds?: readonly "buqu"[];
  ownerResponseSaveSkillIds?: readonly "niepan"[];
} = {}) {
  return createDyingFrame(players, {
    frameId: input.frameId ?? 1,
    victimId: input.victimId ?? "victim",
    reason: { type: "damage", eventId: 2, sourceId: "current" },
    responderOrder: ["current", input.victimId ?? "victim", "helper"],
    entrySaveSkillIds: input.entrySaveSkillIds,
    ownerResponseSaveSkillIds: input.ownerResponseSaveSkillIds,
  });
}

function play(
  players: LifePlayerState[],
  state: AtomicZoneState,
  pending: ReturnType<typeof frame>,
  input: {
    responderId: string;
    cardKind: "peach" | "wine" | "view_as_peach";
    physicalCardId: string;
    from?: ZoneRef;
    eventId: number;
    useId: number;
    childFrameId: number;
    batchId: number;
    viewAsSkillId?: "jijiu" | null;
  },
) {
  return playDyingRescueCard(players, state, pending, {
    eventId: input.eventId,
    responderId: input.responderId,
    cardKind: input.cardKind,
    useId: input.useId,
    cardUseFrameId: input.childFrameId,
    batchId: input.batchId,
    physicalCardId: input.physicalCardId,
    from: input.from ?? { kind: "hand", playerId: input.responderId },
    viewAsSkillId: input.viewAsSkillId ?? null,
  });
}

describe("recoverable dying frame", () => {
  it("pays real Peach costs through nested card-use and move provenance exactly once", () => {
    const players = life(-1);
    const state = zones();
    const pending = frame(players);

    const first = play(players, state, pending, {
      responderId: "current",
      cardKind: "peach",
      physicalCardId: "peach-1",
      eventId: 3,
      useId: 10,
      childFrameId: 11,
      batchId: 20,
    });
    expect(first.recovery.hpAfter).toBe(0);
    expect(currentDyingResponder(pending)).toBe("current");
    expect(pending.rescues[0]).toMatchObject({
      useId: 10,
      cardUseFrameId: 11,
      physicalCardIds: ["peach-1"],
      viewAsSkillId: null,
      provenance: "verified",
    });
    expect(state.processing["11"]?.map((entry) => entry.id)).toEqual(["peach-1"]);

    expect(() => play(players, state, pending, {
      responderId: "current",
      cardKind: "peach",
      physicalCardId: "peach-2",
      eventId: 3,
      useId: 10,
      childFrameId: 12,
      batchId: 21,
    })).toThrow(/already consumed/);
    expect(players[1]?.hp).toBe(0);
    expect(state.players[0]?.hand.some((entry) => entry.id === "peach-2")).toBe(true);

    play(players, state, pending, {
      responderId: "current",
      cardKind: "peach",
      physicalCardId: "peach-2",
      eventId: 4,
      useId: 12,
      childFrameId: 13,
      batchId: 22,
    });
    expect(pending.stage).toBe("rescued");
    expect(players[1]?.hp).toBe(1);
    expect(() => assertDyingFrame(players, pending)).not.toThrow();
  });

  it("permits Wine only for the victim and verifies Jijiu's red physical cost", () => {
    const players = life(0);
    const state = zones();
    const pending = frame(players);
    expect(() => play(players, state, pending, {
      responderId: "current",
      cardKind: "wine",
      physicalCardId: "peach-1",
      eventId: 3,
      useId: 1,
      childFrameId: 2,
      batchId: 3,
    })).toThrow(/owner/);

    play(players, state, pending, {
      responderId: "current",
      cardKind: "view_as_peach",
      physicalCardId: "jijiu-red",
      eventId: 4,
      useId: 4,
      childFrameId: 5,
      batchId: 6,
      viewAsSkillId: "jijiu",
    });
    expect(pending.rescues[0]).toMatchObject({ cardKind: "view_as_peach", viewAsSkillId: "jijiu" });
    expect(state.processing["5"]?.[0]?.id).toBe("jijiu-red");

    const blackPlayers = life(0);
    const blackState = zones();
    const blackFrame = frame(blackPlayers);
    expect(() => play(blackPlayers, blackState, blackFrame, {
      responderId: "current",
      cardKind: "view_as_peach",
      physicalCardId: "jijiu-black",
      eventId: 7,
      useId: 7,
      childFrameId: 8,
      batchId: 9,
      viewAsSkillId: "jijiu",
    })).toThrow(/red physical card/);
    expect(blackState.players[0]?.hand.some((entry) => entry.id === "jijiu-black")).toBe(true);

    const winePlayers = life(0);
    const wineState = zones();
    const wineFrame = frame(winePlayers);
    passDyingRescue(winePlayers, wineFrame, "current");
    play(winePlayers, wineState, wineFrame, {
      responderId: "victim",
      cardKind: "wine",
      physicalCardId: "self-wine",
      eventId: 10,
      useId: 10,
      childFrameId: 11,
      batchId: 12,
    });
    expect(wineFrame.stage).toBe("rescued");
  });

  it("runs Buqu at life deduction and Niepan only at the victim response point", () => {
    const players = life(0);
    const pending = frame(players, {
      entrySaveSkillIds: ["buqu"],
      ownerResponseSaveSkillIds: ["niepan"],
    });
    expect(pending.stage).toBe("entry_save");
    expect(currentDyingEntrySaveSkill(pending)).toBe("buqu");
    expect(currentDyingResponder(pending)).toBeNull();
    expect(() => applyDyingOwnerResponseSave(players, pending, "niepan")).toThrow(/response point/);

    resolveDyingEntrySave(players, pending, { skillId: "buqu", survives: false });
    expect(pending.stage).toBe("rescue");
    passDyingRescue(players, pending, "current");
    expect(currentDyingResponder(pending)).toBe("victim");
    expect(currentDyingOwnerResponseSkill(pending)).toBe("niepan");
    expect(() => passDyingRescue(players, pending, "victim")).toThrow(/skills must resolve/);
    players[1]!.hp = 3; // Niepan's card/max-HP/HP effect resolves before the checkpoint.
    applyDyingOwnerResponseSave(players, pending, "niepan");
    expect(pending).toMatchObject({ stage: "rescued", survivalSkillId: "niepan" });
    expect(pending.skillResolutions.map((entry) => entry.timing)).toEqual(["life_deduction", "victim_response"]);

    const buquPlayers = life(0);
    const buqu = frame(buquPlayers, { entrySaveSkillIds: ["buqu"] });
    resolveDyingEntrySave(buquPlayers, buqu, { skillId: "buqu", survives: true });
    expect(buqu).toMatchObject({ stage: "rescued", survivalSkillId: "buqu" });
    expect(buquPlayers[1]?.hp).toBe(0);
    expect(() => assertDyingFrame(buquPlayers, buqu)).not.toThrow();
  });

  it("requires every timed response before confirming death exactly once", () => {
    const players = life(0);
    const pending = frame(players, { ownerResponseSaveSkillIds: ["niepan"] });
    passDyingRescue(players, pending, "current");
    declineDyingOwnerResponseSave(pending, "niepan");
    passDyingRescue(players, pending, "victim");
    passDyingRescue(players, pending, "helper");
    expect(canConfirmDeath(pending)).toBe(true);
    const death = confirmDeath(players, pending, 30);
    expect(death).toMatchObject({ victimId: "victim", killerId: "current" });
    expect(players[1]?.alive).toBe(false);
    expect(() => confirmDeath(players, pending, 31)).toThrow(/opportunities/);
    expect(() => assertDyingFrame(players, pending)).not.toThrow();
  });

  it("explicitly migrates v1 snapshots without inventing missing card provenance", () => {
    const players = life(0);
    const legacy: LegacyDyingFrameV1 = {
      type: "dying",
      frameId: 1,
      victimId: "victim",
      reason: { type: "damage", eventId: 2, sourceId: "current" },
      responderOrder: ["current", "victim", "helper"],
      responderIndex: 0,
      stage: "rescue",
      rescues: [{
        eventId: 3,
        responderId: "current",
        cardKind: "peach",
        requestedAmount: 1,
        recoveredAmount: 1,
        hpAfter: 0,
      }],
      alternateSaveSkillIds: ["niepan"],
      usedAlternateSaveSkillId: null,
    };
    expect(() => assertDyingFrame(players, legacy as never)).toThrow(/migrateDyingFrame/);
    const migrated = migrateDyingFrame(players, legacy);
    expect(migrated).toMatchObject({ version: 2, migratedFromVersion: 1, stage: "rescue" });
    expect(migrated.rescues[0]).toMatchObject({
      provenance: "legacy_unverified",
      useId: null,
      physicalCardIds: [],
    });
    expect(() => assertDyingFrame(players, migrated)).not.toThrow();

    const deferred = migrateDyingFrame(players, {
      ...legacy,
      responderIndex: 3,
      stage: "alternate_save",
      rescues: [],
    });
    expect(deferred.stage).toBe("legacy_alternate_save");
    players[1]!.hp = 3;
    applyAlternateSave(players, deferred, { skillId: "niepan" });
    expect(deferred.stage).toBe("rescued");
  });

  it("deep-clones resumable state and rejects forged progress", () => {
    const players = life(0);
    const pending = frame(players, { ownerResponseSaveSkillIds: ["niepan"] });
    passDyingRescue(players, pending, "current");
    const restored = cloneDyingFrame(JSON.parse(JSON.stringify(pending)) as typeof pending);
    expect(restored).toEqual(pending);
    restored.ownerResponseSaveSkillIds.splice(0, 1);
    expect(pending.ownerResponseSaveSkillIds).toEqual(["niepan"]);
    restored.responderIndex = 99;
    expect(() => assertDyingFrame(players, restored)).toThrow(DyingError);
  });

  it("suspends every non-top dying victim while a nested victim resolves", () => {
    const players = life(0);
    const stack = createDyingStack();
    const parent = frame(players, { frameId: 1 });
    const child = frame(players, { frameId: 2, victimId: "nested", entrySaveSkillIds: ["buqu"] });
    pushDyingFrame(stack, parent);
    pushDyingFrame(stack, child);
    expect(parent.suspendedByFrameId).toBe(2);
    expect(() => passDyingRescue(players, parent, "current")).toThrow(/stack top/);
    resolveDyingEntrySave(players, child, { skillId: "buqu", survives: true });
    popResolvedDyingFrame(stack, child.frameId);
    expect(parent.suspendedByFrameId).toBeNull();
    passDyingRescue(players, parent, "current");
    expect(currentDyingResponder(parent)).toBe("victim");
    expect(() => assertDyingStack(players, stack)).not.toThrow();
    const restored = cloneDyingStack(JSON.parse(JSON.stringify(stack)) as typeof stack);
    expect(restored).toEqual(stack);
    expect(restored.frames[0]).not.toBe(stack.frames[0]);
  });
});
