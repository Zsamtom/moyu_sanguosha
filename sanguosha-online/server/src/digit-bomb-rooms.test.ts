import type {
  DigitBombAction,
  DigitBombGameView,
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

function digitBombView(
  rooms: RoomService,
  roomId: string,
  viewerId: string,
): DigitBombGameView {
  const view = rooms.getGameView(roomId, viewerId);
  if (!view || !("kind" in view) || view.kind !== "digit_bomb") {
    throw new Error("Missing Digit Bomb view");
  }
  return view;
}

function apply(
  rooms: RoomService,
  roomId: string,
  userId: string,
  action: DigitBombAction,
): DigitBombGameView {
  const before = digitBombView(rooms, roomId, userId);
  const after = rooms.applyAction(roomId, userId, {
    expectedRevision: before.revision,
    expectedPromptId: before.actionPromptId,
    action,
  });
  if (!("kind" in after) || after.kind !== "digit_bomb") {
    throw new Error("Missing Digit Bomb response");
  }
  return after;
}

function startHumanRoom(digits = 4): { rooms: RoomService; roomId: string } {
  const rooms = new RoomService();
  rooms.setConnected(owner.id, true);
  rooms.setConnected(guest.id, true);
  const created = rooms.create(owner, {
    name: "数字炸弹",
    gameType: "digit_bomb",
    digitBombDigits: digits,
  });
  rooms.join(created.id, guest);
  rooms.setReady(created.id, owner.id, true);
  rooms.setReady(created.id, guest.id, true);
  rooms.start(created.id, owner.id);
  return { rooms, roomId: created.id };
}

function submitSecrets(rooms: RoomService, roomId: string, digits: number): DigitBombGameView {
  apply(rooms, roomId, guest.id, {
    type: "digit_bomb_set_secret",
    playerId: guest.id,
    secret: "0".repeat(digits),
  });
  return apply(rooms, roomId, owner.id, {
    type: "digit_bomb_set_secret",
    playerId: owner.id,
    secret: "1".repeat(digits),
  });
}

function finishRound(rooms: RoomService, roomId: string): DigitBombGameView {
  const before = digitBombView(rooms, roomId, owner.id);
  const guesserId = before.currentPlayerId!;
  const responderId = guesserId === owner.id ? guest.id : owner.id;
  apply(rooms, roomId, guesserId, {
    type: "digit_bomb_guess",
    playerId: guesserId,
    guess: "9".repeat(before.digits),
  });
  return apply(rooms, roomId, responderId, {
    type: "digit_bomb_feedback",
    playerId: responderId,
    correctPositions: before.digits,
  });
}

describe("Digit Bomb rooms", () => {
  it("creates a fixed two-player room, persists digits, and starts with LLM disabled", () => {
    const defaults = new RoomService();
    const defaultRoom = defaults.create(owner, {
      name: "默认数字炸弹",
      gameType: "digit_bomb",
      maxPlayers: 8,
    });
    expect(defaultRoom).toMatchObject({
      maxPlayers: 2,
      digitBombDigits: 4,
      botMode: "rules",
    });

    const { rooms, roomId } = startHumanRoom(6);
    expect(rooms.get(roomId)).toMatchObject({
      gameType: "digit_bomb",
      maxPlayers: 2,
      digitBombDigits: 6,
      playerCount: 2,
      status: "playing",
      botMode: "rules",
      llmBot: { available: false },
    });
    expect(digitBombView(rooms, roomId, owner.id)).toMatchObject({
      kind: "digit_bomb",
      digits: 6,
      phase: "setup",
    });
    expect(rooms.exportSnapshot().rooms[0]).toMatchObject({
      gameType: "digit_bomb",
      digitBombDigits: 6,
      game: { kind: "digit_bomb", digits: 6 },
    });
  });

  it("accepts independent setup and projects each secret only to its owner", () => {
    const { rooms, roomId } = startHumanRoom();
    const before = digitBombView(rooms, roomId, guest.id);
    const afterGuest = apply(rooms, roomId, guest.id, {
      type: "digit_bomb_set_secret",
      playerId: guest.id,
      secret: "0007",
    });
    expect(afterGuest.players.find((player) => player.id === guest.id)?.secretSubmitted).toBe(true);
    expect(afterGuest.ownSecret).toBe("0007");
    expect(() => rooms.applyAction(roomId, guest.id, {
      expectedRevision: before.revision,
      expectedPromptId: before.actionPromptId,
      action: {
        type: "digit_bomb_set_secret",
        playerId: guest.id,
        secret: "1234",
      },
    })).toThrow(/游戏状态已更新/);

    apply(rooms, roomId, owner.id, {
      type: "digit_bomb_set_secret",
      playerId: owner.id,
      secret: "8642",
    });
    const ownerView = digitBombView(rooms, roomId, owner.id);
    const guestView = digitBombView(rooms, roomId, guest.id);
    expect(ownerView.phase).toBe("guess");
    expect(ownerView.ownSecret).toBe("8642");
    expect(guestView.ownSecret).toBe("0007");
    expect(JSON.stringify(ownerView)).not.toContain("0007");
    expect(JSON.stringify(guestView)).not.toContain("8642");
    expect(ownerView.players.every((player) => !("secret" in player))).toBe(true);
    expect(guestView.players.every((player) => !("secret" in player))).toBe(true);

    expect(() => rooms.applyAction(roomId, ownerView.currentPlayerId!, {
      expectedRevision: ownerView.revision,
      expectedPromptId: ownerView.actionPromptId,
      action: { type: "splendor_pass", playerId: ownerView.currentPlayerId! },
    })).toThrow(/该房间正在进行数字炸弹/);
  });

  it("preserves scores across rematches and settles after matching votes", () => {
    const { rooms, roomId } = startHumanRoom();
    submitSecrets(rooms, roomId, 4);
    const firstResult = finishRound(rooms, roomId);
    const winnerId = firstResult.roundResult!.winnerId;
    expect(firstResult.roundResult).toMatchObject({ attempts: 1, points: 10 });

    apply(rooms, roomId, owner.id, {
      type: "digit_bomb_vote",
      playerId: owner.id,
      vote: "rematch",
    });
    const rematched = apply(rooms, roomId, guest.id, {
      type: "digit_bomb_vote",
      playerId: guest.id,
      vote: "rematch",
    });
    expect(rematched).toMatchObject({ phase: "setup", round: 2, digits: 4 });
    expect(rematched.players.find((player) => player.id === winnerId)?.score).toBe(10);

    submitSecrets(rooms, roomId, 4);
    finishRound(rooms, roomId);
    apply(rooms, roomId, owner.id, {
      type: "digit_bomb_vote",
      playerId: owner.id,
      vote: "settle",
    });
    const settled = apply(rooms, roomId, guest.id, {
      type: "digit_bomb_vote",
      playerId: guest.id,
      vote: "settle",
    });
    expect(settled).toMatchObject({
      status: "finished",
      phase: "finished",
      winner: { reason: "settle" },
    });
    expect(rooms.get(roomId)?.status).toBe("finished");
  });

  it("lets a rule bot set a secret, guess, honestly respond, and follow settle", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "机器人数字炸弹",
      gameType: "digit_bomb",
      digitBombDigits: 3,
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    const afterSecret = apply(rooms, created.id, owner.id, {
      type: "digit_bomb_set_secret",
      playerId: owner.id,
      secret: "123",
    });
    expect(afterSecret.players.every((player) => player.secretSubmitted)).toBe(true);
    expect(rooms.get(created.id)).toMatchObject({
      botMode: "rules",
      llmBot: { available: false },
      players: expect.arrayContaining([
        expect.objectContaining({ isBot: true, botTitle: "拆弹专家" }),
      ]),
    });
    expect(afterSecret.prompt.type === "guess" || afterSecret.prompt.type === "feedback").toBe(true);
    expect(afterSecret.revision).toBeGreaterThan(1);
  });

  it("restores the room and finishes by forfeit when a player leaves", () => {
    const { rooms, roomId } = startHumanRoom(8);
    submitSecrets(rooms, roomId, 8);
    const restored = new RoomService();
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(restored.get(roomId)).toMatchObject({
      gameType: "digit_bomb",
      digitBombDigits: 8,
      status: "playing",
    });
    expect(digitBombView(restored, roomId, owner.id).digits).toBe(8);

    restored.leave(roomId, guest.id);
    expect(restored.get(roomId)).toMatchObject({ status: "finished", playerCount: 1 });
    expect(digitBombView(restored, roomId, owner.id).winner).toMatchObject({
      reason: "forfeit",
      playerIds: [owner.id],
    });
  });
});
