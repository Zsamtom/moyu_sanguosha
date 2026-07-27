import { describe, expect, it } from "vitest";
import {
  chooseGoujiBotAction,
  type GoujiGameState,
} from "@sanguosha/shared";
import type { PublicUser } from "./users.js";
import { RoomService } from "./rooms.js";

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

describe("Gouji rooms", () => {
  it("uses the shared room lifecycle, fixes capacity at six, and supports bots", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "机器人够级",
      gameType: "gouji",
      maxPlayers: 4,
    });

    expect(created).toMatchObject({ gameType: "gouji", maxPlayers: 6, status: "waiting" });
    for (let index = 0; index < 5; index += 1) rooms.addBot(created.id, owner.id);
    const waiting = rooms.get(created.id);
    const bots = waiting?.players.filter((player) => player.isBot) ?? [];
    expect(new Set(bots.map((bot) => bot.displayName)).size).toBe(5);
    expect(bots.every((bot) => bot.botTitle === "牌桌熟手")).toBe(true);
    expect(bots.every((bot) => !bot.displayName.startsWith("机器人"))).toBe(true);
    rooms.setReady(created.id, owner.id, true);

    const started = rooms.start(created.id, owner.id);
    expect(started).toMatchObject({ gameType: "gouji", status: "playing", playerCount: 6 });
    const game = rooms.getGameView(created.id, owner.id);
    expect(game).toMatchObject({ kind: "gouji", status: "playing" });
    if (!game || !("kind" in game) || game.kind !== "gouji") throw new Error("Missing Gouji view");
    expect(game.players.find((player) => player.id === owner.id)?.hand).toBeDefined();
    expect(game.players.filter((player) => player.id !== owner.id).every((player) => player.hand === undefined)).toBe(true);
    expect(game.players.filter((player) => player.id !== owner.id).every((player) => player.botTitle === "牌桌熟手")).toBe(true);
  });

  it("restores a persisted Gouji room and keeps its game type", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, { name: "可恢复够级", gameType: "gouji" });
    for (let index = 0; index < 5; index += 1) rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    const restored = new RoomService();
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(restored.get(created.id)).toMatchObject({
      gameType: "gouji",
      maxPlayers: 6,
      playerCount: 6,
    });
    expect(restored.getGameView(created.id, owner.id)).toMatchObject({ kind: "gouji" });
  });

  it("continues bot turns after the human submits a Gouji action", () => {
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, { name: "bot continuation", gameType: "gouji" });
    for (let index = 0; index < 5; index += 1) rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    const before = rooms.getGameView(created.id, owner.id);
    const savedRoom = rooms.exportSnapshot().rooms.find((room) => room.id === created.id);
    const savedGame = savedRoom?.game;
    if (
      !before ||
      !("kind" in before) ||
      before.kind !== "gouji" ||
      !savedGame ||
      !("kind" in savedGame) ||
      savedGame.kind !== "gouji"
    ) {
      throw new Error("Missing active Gouji game");
    }
    expect(before.currentPlayerId).toBe(owner.id);

    const action = chooseGoujiBotAction(savedGame as GoujiGameState, owner.id);
    const after = rooms.applyAction(created.id, owner.id, {
      expectedRevision: before.revision,
      expectedPromptId: before.actionPromptId,
      action,
    });
    if (!("kind" in after) || after.kind !== "gouji") throw new Error("Missing Gouji response");

    expect(after.revision).toBeGreaterThan(before.revision + 1);
    expect(after.status === "finished" || after.currentPlayerId === owner.id).toBe(true);
  });
});
