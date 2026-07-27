import {
  chooseSplendorBotAction,
  type SplendorGameState,
  type SplendorGameView,
  type SplendorGameKind,
} from "@sanguosha/shared";
import { describe, expect, it } from "vitest";
import { RoomService } from "./rooms.js";
import type { PublicUser } from "./users.js";

function user(id: string, username: string): PublicUser {
  const now = new Date().toISOString();
  return {
    id,
    username,
    displayName: username,
    role: "player",
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

const owner = user("11111111-1111-4111-8111-111111111111", "owner");
const guest = user("22222222-2222-4222-8222-222222222222", "guest");
const third = user("33333333-3333-4333-8333-333333333333", "third");

function activeGame(
  rooms: RoomService,
  roomId: string,
  viewerId: string,
): SplendorGameView {
  const view = rooms.getGameView(roomId, viewerId);
  if (
    !view ||
    !("kind" in view) ||
    (view.kind !== "splendor" && view.kind !== "splendor_pokemon")
  ) {
    throw new Error("Missing Splendor view");
  }
  return view;
}

function savedGame(rooms: RoomService, roomId: string): SplendorGameState {
  const game = rooms.exportSnapshot().rooms.find((room) => room.id === roomId)?.game;
  if (
    !game ||
    !("kind" in game) ||
    (game.kind !== "splendor" && game.kind !== "splendor_pokemon")
  ) {
    throw new Error("Missing Splendor state");
  }
  return game;
}

function startHumanRoom(kind: SplendorGameKind): { rooms: RoomService; roomId: string } {
  const rooms = new RoomService();
  rooms.setConnected(owner.id, true);
  rooms.setConnected(guest.id, true);
  const created = rooms.create(owner, { name: `测试-${kind}`, gameType: kind });
  rooms.join(created.id, guest);
  rooms.setReady(created.id, owner.id, true);
  rooms.setReady(created.id, guest.id, true);
  rooms.start(created.id, owner.id);
  return { rooms, roomId: created.id };
}

describe.each(["splendor", "splendor_pokemon"] as const)("%s rooms", (kind) => {
  it("creates, joins, readies, starts, and applies a revision-guarded action", () => {
    const { rooms, roomId } = startHumanRoom(kind);
    expect(rooms.get(roomId)).toMatchObject({
      gameType: kind,
      maxPlayers: 4,
      playerCount: 2,
      status: "playing",
      botMode: "rules",
      llmBot: { available: false },
    });

    const before = activeGame(rooms, roomId, owner.id);
    expect(before).toMatchObject({ kind, status: "playing" });
    const actingUser = before.currentPlayerId === owner.id ? owner : guest;
    const waitingView = activeGame(rooms, roomId, actingUser.id);
    const action = chooseSplendorBotAction(savedGame(rooms, roomId), actingUser.id);
    const after = rooms.applyAction(roomId, actingUser.id, {
      expectedRevision: waitingView.revision,
      expectedPromptId: waitingView.actionPromptId,
      action,
    });
    expect(after.revision).toBe(waitingView.revision + 1);

    expect(() => rooms.applyAction(roomId, actingUser.id, {
      expectedRevision: waitingView.revision,
      expectedPromptId: waitingView.actionPromptId,
      action,
    })).toThrow(/游戏状态已更新/);

    const nextView = activeGame(rooms, roomId, after.currentPlayerId);
    expect(() => rooms.applyAction(roomId, after.currentPlayerId, {
      expectedRevision: nextView.revision,
      expectedPromptId: nextView.actionPromptId,
      action: { type: "gouji_pass", playerId: after.currentPlayerId },
    })).toThrow(/该房间正在进行璀璨宝石/);
    expect(() => rooms.applyAction(roomId, owner.id, {
      expectedRevision: nextView.revision,
      expectedPromptId: nextView.actionPromptId,
      action: { type: "splendor_pass", playerId: guest.id },
    })).toThrow(/不能替其他玩家执行操作/);
  });

  it("keeps a deck reservation private to its owner", () => {
    const { rooms, roomId } = startHumanRoom(kind);
    const initial = activeGame(rooms, roomId, owner.id);
    const actingUser = initial.currentPlayerId === owner.id ? owner : guest;
    const otherUser = actingUser.id === owner.id ? guest : owner;
    const before = activeGame(rooms, roomId, actingUser.id);
    if (
      before.prompt.type !== "take" &&
      before.prompt.type !== "buy" &&
      before.prompt.type !== "reserve"
    ) {
      throw new Error("Expected a main-phase Splendor prompt");
    }
    const level = before.prompt.reserveDeckLevels[0];
    if (level === undefined) throw new Error("Expected a reservable deck");

    rooms.applyAction(roomId, actingUser.id, {
      expectedRevision: before.revision,
      expectedPromptId: before.actionPromptId,
      action: { type: "splendor_reserve", playerId: actingUser.id, level },
    });

    const actorView = activeGame(rooms, roomId, actingUser.id);
    const otherView = activeGame(rooms, roomId, otherUser.id);
    const actorAsSeenByActor = actorView.players.find((player) => player.id === actingUser.id);
    const actorAsSeenByOther = otherView.players.find((player) => player.id === actingUser.id);
    expect(actorAsSeenByActor?.reservedCount).toBe(1);
    expect(actorAsSeenByActor?.reservedCards).toHaveLength(1);
    expect(actorAsSeenByOther?.reservedCount).toBe(1);
    expect(actorAsSeenByOther?.reservedCards).toBeUndefined();
    expect(actorAsSeenByOther?.publicReservedCards).toHaveLength(0);
  });

  it("runs rule bots and restores the authoritative room", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "机器人宝石桌",
      gameType: kind,
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    const waitingForOwner = activeGame(rooms, created.id, owner.id);
    const action = chooseSplendorBotAction(savedGame(rooms, created.id), owner.id);
    const after = rooms.applyAction(created.id, owner.id, {
      expectedRevision: waitingForOwner.revision,
      expectedPromptId: waitingForOwner.actionPromptId,
      action,
    });
    expect(after.revision).toBeGreaterThan(waitingForOwner.revision + 1);
    expect(after.status === "finished" || after.currentPlayerId === owner.id).toBe(true);
    expect(rooms.get(created.id)).toMatchObject({
      botMode: "rules",
      llmBot: { available: false },
      players: expect.arrayContaining([
        expect.objectContaining({ isBot: true, botTitle: "宝石行家" }),
      ]),
    });

    const restored = new RoomService();
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(restored.get(created.id)).toMatchObject({
      gameType: kind,
      status: rooms.get(created.id)?.status,
      maxPlayers: 4,
    });
    expect(activeGame(restored, created.id, owner.id).kind).toBe(kind);
  });

  it("finishes by forfeit when one of two players leaves", () => {
    const { rooms, roomId } = startHumanRoom(kind);
    rooms.leave(roomId, guest.id);
    expect(rooms.get(roomId)).toMatchObject({ status: "finished", playerCount: 1 });
    expect(activeGame(rooms, roomId, owner.id).winner).toMatchObject({
      reason: "forfeit",
      playerIds: [owner.id],
    });
  });
});

describe("Splendor room seat limits", () => {
  it("allows configurable 2-4 seat rooms and rejects capacities outside that range", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    rooms.setConnected(guest.id, true);
    rooms.setConnected(third.id, true);
    const created = rooms.create(owner, {
      name: "双人宝石",
      gameType: "splendor",
      maxPlayers: 2,
    });
    rooms.join(created.id, guest);
    expect(() => rooms.join(created.id, third)).toThrow(/房间已满/);
    expect(() => new RoomService().create(third, {
      name: "五人宝石",
      gameType: "splendor_pokemon",
      maxPlayers: 5,
    })).toThrow(/房间人数需为 2 至 4 人/);
  });
});
