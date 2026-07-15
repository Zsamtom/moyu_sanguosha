import type { Pool } from "pg";
import {
  GameRuleError,
  applyAction,
  createGame,
  getCardDefinition,
  type Card,
  type CardKind,
  type GameSession,
} from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";

import { loadRoomSnapshot } from "./room-persistence.js";
import type { RoomServiceSnapshot } from "./rooms.js";

type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type MutableSnapshot = DeepMutable<RoomServiceSnapshot>;

interface LethalFixture {
  readonly snapshot: RoomServiceSnapshot;
  readonly actorId: string;
  readonly victimId: string;
  readonly otherId: string;
  readonly slashId: string;
  readonly peachId: string;
}

function poolWithSnapshot(snapshot: unknown): Pool {
  const query = vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"];
  return { query } as unknown as Pool;
}

function standardCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function buildLethalFixture(): LethalFixture {
  const playerIds = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const game = createGame({ playerIds, seed: "a".repeat(64) });
  const actor = game.players.find((player) => player.id === game.currentPlayerId);
  const victims = game.players.filter((player) => player.id !== game.currentPlayerId);
  const victim = victims[0];
  const other = victims[1];
  if (!actor || !victim || !other) throw new Error("Missing lethal persistence fixture players");

  game.discardPile.push(...game.players.flatMap((player) => player.hand));
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  const slashId = "persist-live-lethal-slash";
  const peachId = "persist-live-rescue-peach";
  actor.hand = [standardCard(slashId, "slash")];
  victim.hand = [standardCard(peachId, "peach", "heart")];
  victim.hp = 1;
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };

  const awaitingDodge = applyAction(game, {
    type: "play_card",
    playerId: actor.id,
    cardId: slashId,
    targetId: victim.id,
  });
  const lethal = applyAction(awaitingDodge, {
    type: "respond",
    playerId: victim.id,
    cardId: null,
  });
  if (lethal.pendingResponse?.type !== "dying" || lethal.pendingResponse.resume.type !== "damage_flow") {
    throw new Error("Real lethal damage did not stop at the DamageFlow dying barrier");
  }
  if (lethal.completeRules.damageFlow.frames.length !== 1) {
    throw new Error("Real lethal damage did not retain exactly one active DamageFlow frame");
  }

  const snapshot: RoomServiceSnapshot = {
    version: 1,
    rooms: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Live lethal persistence",
      ownerId: actor.id,
      status: "playing",
      maxPlayers: 3,
      createdAt: new Date().toISOString(),
      players: lethal.players.map((player) => ({
        id: player.id,
        username: player.id === actor.id ? "live-actor" : player.id === victim.id ? "live-victim" : "live-other",
        displayName: player.id === actor.id ? "live-actor" : player.id === victim.id ? "live-victim" : "live-other",
        ready: true,
        connected: false,
        seat: player.seat,
      })),
      game: lethal,
    }],
  };
  return {
    snapshot,
    actorId: actor.id,
    victimId: victim.id,
    otherId: other.id,
    slashId,
    peachId,
  };
}

function mutableFixtureSnapshot(fixture: LethalFixture): MutableSnapshot {
  return structuredClone(fixture.snapshot) as MutableSnapshot;
}

function activeParts(snapshot: MutableSnapshot) {
  const game = snapshot.rooms[0]?.game;
  if (!game) throw new Error("Missing forged game");
  const pending = game.pendingResponse;
  if (pending?.type !== "dying" || pending.resume.type !== "damage_flow") {
    throw new Error("Missing forged DamageFlow dying cursor");
  }
  const frame = game.completeRules.damageFlow.frames[0];
  if (!frame || !frame.dying || !frame.callerContinuation) {
    throw new Error("Missing forged active damage frame parts");
  }
  return {
    game,
    pending,
    frame,
    barrier: frame.dying,
    caller: frame.callerContinuation,
  };
}

async function expectInvalid(snapshot: MutableSnapshot): Promise<void> {
  const result = await loadRoomSnapshot(poolWithSnapshot(snapshot));
  expect(result).toMatchObject({ kind: "invalid" });
}

describe("live lethal DamageFlow persistence", () => {
  it("restores the active barrier and completes its frame exactly once after a Peach rescue", async () => {
    const fixture = buildLethalFixture();
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    if (!restored) throw new Error("Restored room lost its game");

    expect(restored.pendingResponse).toMatchObject({
      type: "dying",
      victimId: fixture.victimId,
      damageSourceId: fixture.actorId,
      targetId: fixture.victimId,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(restored.completeRules.damageFlow).toMatchObject({
      frames: [{ frameId: 1, damageId: 1, step: "dying", dying: { dyingId: 1 } }],
      completedDamageIds: [],
      completedFrameIds: [],
    });

    const rescued = applyAction(restored, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.peachId,
    });
    expect(rescued.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: 1, alive: true });
    expect(rescued.pendingResponse).toBeNull();
    expect(rescued.turn.phase).toBe("play");
    expect(rescued.completeRules.damageFlow.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(rescued.completeRules.damageFlow.completedFrameIds).toEqual([1]);
    expect(rescued.completeRules.damageFlow.completedDamageIds.filter((damageId) => damageId === 1)).toHaveLength(1);
    expect(rescued.completeRules.nextDamageId).toBe(2);
    expect(rescued.resolvingCards).toEqual([]);
    expect(rescued.discardPile.filter((card) => card.id === fixture.slashId)).toHaveLength(1);
    expect(rescued.discardPile.filter((card) => card.id === fixture.peachId)).toHaveLength(1);
    expect(() => applyAction(rescued, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.peachId,
    })).toThrow(GameRuleError);
  });

  const cursorMutations: ReadonlyArray<[
    string,
    (snapshot: MutableSnapshot, fixture: LethalFixture) => void,
  ]> = [
    ["cursor frameId", (snapshot) => { activeParts(snapshot).pending.resume.frameId += 1; }],
    ["cursor damageId", (snapshot) => { activeParts(snapshot).pending.resume.damageId += 1; }],
    ["cursor dyingId", (snapshot) => { activeParts(snapshot).pending.resume.dyingId += 1; }],
    ["pending victim", (snapshot, fixture) => { activeParts(snapshot).pending.victimId = fixture.otherId; }],
    ["pending damage source", (snapshot) => { activeParts(snapshot).pending.damageSourceId = null; }],
    ["barrier hp", (snapshot) => { activeParts(snapshot).barrier.hpAfterDamage -= 1; }],
    ["caller type", (snapshot) => { activeParts(snapshot).caller.type = "game_session.damage_resume.v0"; }],
    ["caller data", (snapshot) => { activeParts(snapshot).caller.data = {}; }],
    ["caller business player", (snapshot) => {
      const caller = activeParts(snapshot).caller;
      const data = caller.data as unknown as {
        resume: { type: string; pending: { attackerId: string } };
      };
      data.resume.pending.attackerId = "99999999-9999-4999-8999-999999999999";
    }],
    ["missing active frame", (snapshot) => { activeParts(snapshot).game.completeRules.damageFlow.frames = []; }],
    ["missing pending dying", (snapshot) => { activeParts(snapshot).game.pendingResponse = null; }],
    ["finished game with active flow", (snapshot) => { activeParts(snapshot).game.status = "finished"; }],
    ["extra active frame", (snapshot) => {
      const { game, frame } = activeParts(snapshot);
      game.completeRules.damageFlow.frames.push(structuredClone(frame));
    }],
  ];

  it.each(cursorMutations)("rejects tampered %s", async (_name, mutate) => {
    const fixture = buildLethalFixture();
    const forged = mutableFixtureSnapshot(fixture);
    mutate(forged, fixture);
    await expectInvalid(forged);
  });
});
