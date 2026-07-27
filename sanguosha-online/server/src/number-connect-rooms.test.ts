import type {
  NumberConnectAction,
  NumberConnectGameView,
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

function view(
  rooms: RoomService,
  roomId: string,
  viewerId: string,
): NumberConnectGameView {
  const game = rooms.getGameView(roomId, viewerId);
  if (!game || !("kind" in game) || game.kind !== "number_connect") {
    throw new Error("Missing Number Connect view");
  }
  return game;
}

function apply(
  rooms: RoomService,
  roomId: string,
  userId: string,
  action: NumberConnectAction,
): NumberConnectGameView {
  const before = view(rooms, roomId, userId);
  const game = rooms.applyAction(roomId, userId, {
    expectedRevision: before.revision,
    expectedPromptId: before.actionPromptId,
    action,
  });
  if (!("kind" in game) || game.kind !== "number_connect") {
    throw new Error("Missing Number Connect response");
  }
  return game;
}

function startHumanRoom(): { rooms: RoomService; roomId: string } {
  const rooms = new RoomService();
  rooms.setConnected(owner.id, true);
  rooms.setConnected(guest.id, true);
  const created = rooms.create(owner, {
    name: "数字连连看",
    gameType: "number_connect",
    maxPlayers: 8,
  });
  rooms.join(created.id, guest);
  rooms.setReady(created.id, owner.id, true);
  rooms.setReady(created.id, guest.id, true);
  rooms.start(created.id, owner.id);
  return { rooms, roomId: created.id };
}

describe("Number Connect rooms", () => {
  it("creates a fixed two-player room and keeps the opponent board private", () => {
    const { rooms, roomId } = startHumanRoom();
    expect(rooms.get(roomId)).toMatchObject({
      gameType: "number_connect",
      maxPlayers: 2,
      status: "playing",
      botMode: "rules",
      llmBot: { available: false },
    });
    const ownerView = view(rooms, roomId, owner.id);
    const guestView = view(rooms, roomId, guest.id);
    expect(ownerView.players.find((player) => player.id === owner.id)?.board).toHaveLength(25);
    expect(ownerView.players.find((player) => player.id === guest.id)?.board).toBeUndefined();
    expect(guestView.players.find((player) => player.id === guest.id)?.board).toHaveLength(25);
    expect(guestView.players.find((player) => player.id === owner.id)?.board).toBeUndefined();
  });

  it("accepts a turn-safe call, marks it globally, and rejects another game's action", () => {
    const { rooms, roomId } = startHumanRoom();
    const before = view(rooms, roomId, owner.id);
    const callerId = before.currentPlayerId!;
    const after = apply(rooms, roomId, callerId, {
      type: "number_connect_call",
      playerId: callerId,
      number: 13,
    });
    expect(after).toMatchObject({
      calledNumbers: [13],
      lastNumber: 13,
    });
    expect(after.currentPlayerId).not.toBe(callerId);

    expect(() => rooms.applyAction(roomId, after.currentPlayerId!, {
      expectedRevision: after.revision,
      expectedPromptId: after.actionPromptId,
      action: {
        type: "digit_bomb_guess",
        playerId: after.currentPlayerId!,
        guess: "1234",
      },
    })).toThrow(/该房间正在进行数字连连看/);
  });

  it("finishes at five lines, keeps boards private, and restores the snapshot", () => {
    const { rooms, roomId } = startHumanRoom();
    for (let number = 1; number <= 25; number += 1) {
      const before = view(rooms, roomId, owner.id);
      if (before.status === "finished") break;
      apply(rooms, roomId, before.currentPlayerId!, {
        type: "number_connect_call",
        playerId: before.currentPlayerId!,
        number,
      });
    }
    const finished = view(rooms, roomId, owner.id);
    expect(finished).toMatchObject({
      status: "finished",
      prompt: { type: "finished" },
      winner: { reason: "lines" },
    });
    expect(finished.players.find((player) => player.id === owner.id)?.board).toHaveLength(25);
    expect(finished.players.find((player) => player.id === guest.id)?.board).toBeUndefined();
    const guestFinished = view(rooms, roomId, guest.id);
    expect(guestFinished.players.find((player) => player.id === guest.id)?.board).toHaveLength(25);
    expect(guestFinished.players.find((player) => player.id === owner.id)?.board).toBeUndefined();
    expect(Math.max(...finished.players.map((player) => player.lineCount))).toBeGreaterThanOrEqual(5);

    const restored = new RoomService();
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(view(restored, roomId, owner.id)).toEqual(finished);
  });

  it("lets a rule bot play from its own board and resolves a departure", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "机器人数字连线",
      gameType: "number_connect",
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);
    expect(rooms.get(created.id)).toMatchObject({
      botMode: "rules",
      players: expect.arrayContaining([
        expect.objectContaining({ isBot: true, botTitle: "连线高手" }),
      ]),
    });
    const active = view(rooms, created.id, owner.id);
    expect(active.currentPlayerId).toBe(owner.id);

    rooms.leave(created.id, owner.id);
    expect(rooms.get(created.id)).toBeUndefined();
  });

  it("awards the match to the remaining human when the opponent leaves", () => {
    const { rooms, roomId } = startHumanRoom();
    rooms.leave(roomId, guest.id);
    expect(rooms.get(roomId)).toMatchObject({ status: "finished", playerCount: 1 });
    expect(view(rooms, roomId, owner.id).winner).toMatchObject({
      reason: "forfeit",
      playerIds: [owner.id],
    });
  });
});
