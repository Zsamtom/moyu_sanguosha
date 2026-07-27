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

  it("accepts concurrent marks on separate private boards and rejects another game's action", () => {
    const { rooms, roomId } = startHumanRoom();
    const ownerBefore = view(rooms, roomId, owner.id);
    const guestBefore = view(rooms, roomId, guest.id);
    const after = rooms.applyAction(roomId, owner.id, {
      expectedRevision: ownerBefore.revision,
      expectedPromptId: ownerBefore.actionPromptId,
      action: {
        type: "number_connect_call",
        playerId: owner.id,
        number: 13,
      },
    });
    expect(after).toMatchObject({
      calledNumbers: [13],
      lastNumber: 13,
    });
    expect(after.currentPlayerId).toBeNull();
    const ownerRapidSecondMark = rooms.applyAction(roomId, owner.id, {
      expectedRevision: ownerBefore.revision,
      expectedPromptId: ownerBefore.actionPromptId,
      action: {
        type: "number_connect_call",
        playerId: owner.id,
        number: 14,
      },
    });
    expect(ownerRapidSecondMark).toMatchObject({
      calledNumbers: [13, 14],
      lastNumber: 14,
    });
    expect(view(rooms, roomId, guest.id)).toMatchObject({
      calledNumbers: [],
      lastNumber: null,
    });
    const guestAfter = rooms.applyAction(roomId, guest.id, {
      expectedRevision: guestBefore.revision,
      expectedPromptId: guestBefore.actionPromptId,
      action: {
        type: "number_connect_call",
        playerId: guest.id,
        number: 13,
      },
    });
    expect(guestAfter).toMatchObject({ calledNumbers: [13], lastNumber: 13 });

    const currentOwnerView = view(rooms, roomId, owner.id);
    expect(() => rooms.applyAction(roomId, owner.id, {
      expectedRevision: currentOwnerView.revision,
      expectedPromptId: currentOwnerView.actionPromptId,
      action: {
        type: "digit_bomb_guess",
        playerId: owner.id,
        guess: "1234",
      },
    })).toThrow(/该房间正在进行数字连连看/);
  });

  it("reveals both finished boards, restores the snapshot, and starts a confirmed rematch", () => {
    const { rooms, roomId } = startHumanRoom();
    for (let turn = 0; turn < 25; turn += 1) {
      const before = view(rooms, roomId, owner.id);
      if (before.status === "finished") break;
      if (before.prompt.type !== "call") throw new Error("Missing Number Connect call prompt");
      apply(rooms, roomId, owner.id, {
        type: "number_connect_call",
        playerId: owner.id,
        number: before.prompt.availableNumbers[0]!,
      });
    }
    const finished = view(rooms, roomId, owner.id);
    expect(finished).toMatchObject({
      status: "finished",
      prompt: { type: "finished" },
      winner: { reason: "lines" },
    });
    expect(finished.players.find((player) => player.id === owner.id)?.board).toHaveLength(25);
    expect(finished.players.find((player) => player.id === guest.id)?.board).toHaveLength(25);
    expect(finished.players.every((player) => Array.isArray(player.markedNumbers))).toBe(true);
    const guestFinished = view(rooms, roomId, guest.id);
    expect(guestFinished.players.find((player) => player.id === guest.id)?.board).toHaveLength(25);
    expect(guestFinished.players.find((player) => player.id === owner.id)?.board).toHaveLength(25);
    expect(Math.max(...finished.players.map((player) => player.lineCount))).toBeGreaterThanOrEqual(5);

    const restored = new RoomService();
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(view(restored, roomId, owner.id)).toEqual(finished);

    const ownerConfirmed = rooms.requestRematch(roomId, owner.id);
    expect(ownerConfirmed).toMatchObject({
      status: "finished",
      players: expect.arrayContaining([
        expect.objectContaining({ id: owner.id, ready: true }),
        expect.objectContaining({ id: guest.id, ready: false }),
      ]),
    });
    const rematched = rooms.requestRematch(roomId, guest.id);
    expect(rematched.status).toBe("playing");
    const nextGame = view(rooms, roomId, owner.id);
    expect(nextGame).toMatchObject({
      status: "playing",
      currentPlayerId: null,
      calledNumbers: [],
      lastNumber: null,
      winner: null,
    });
    expect(nextGame.players.find((player) => player.id === owner.id)?.board).toHaveLength(25);
    expect(nextGame.players.find((player) => player.id === guest.id)?.board).toBeUndefined();
  });

  it("does not allow rule bots", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "真人数字连线",
      gameType: "number_connect",
      botMode: "llm",
    });
    expect(() => rooms.addBot(created.id, owner.id)).toThrow(/不支持规则机器人/);
    expect(rooms.get(created.id)).toMatchObject({
      status: "waiting",
      playerCount: 1,
      botMode: "rules",
    });

    const activeRoom = startHumanRoom();
    const snapshot = activeRoom.rooms.exportSnapshot();
    snapshot.rooms[0]!.players[1]!.isBot = true;
    expect(() => new RoomService().restoreSnapshot(snapshot)).toThrow(
      /contains a bot unsupported by number_connect/,
    );
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
