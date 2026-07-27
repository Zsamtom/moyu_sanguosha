import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseDoudizhuBotAction, type DoudizhuGameState } from "@sanguosha/shared";
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

describe("Doudizhu rooms", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fixes capacity at three, starts with bots, and hides their hands", () => {
    const rooms = new RoomService(90_000, 200, 0, [0, 0]);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "欢乐斗地主",
      gameType: "doudizhu",
      maxPlayers: 8,
    });

    expect(created).toMatchObject({ gameType: "doudizhu", maxPlayers: 3, status: "waiting" });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    const waiting = rooms.get(created.id);
    expect(waiting?.players.filter((player) => player.isBot).every((bot) => bot.botTitle === "欢乐牌手")).toBe(true);
    const botNames = waiting?.players.filter((player) => player.isBot).map((bot) => bot.displayName) ?? [];
    expect(new Set(botNames).size).toBe(2);
    expect(botNames.every((name) => !name.startsWith("机器人"))).toBe(true);
    rooms.setReady(created.id, owner.id, true);

    const started = rooms.start(created.id, owner.id);
    expect(started).toMatchObject({ gameType: "doudizhu", status: "playing", playerCount: 3 });
    const game = rooms.getGameView(created.id, owner.id);
    expect(game).toMatchObject({ kind: "doudizhu", status: "playing" });
    if (!game || !("kind" in game) || game.kind !== "doudizhu") throw new Error("Missing Doudizhu view");
    expect(game.players.find((player) => player.id === owner.id)?.hand).toBeDefined();
    expect(game.players.filter((player) => player.id !== owner.id).every((player) => player.hand === undefined)).toBe(true);
  });

  it("restores and continues an authoritative Doudizhu game", () => {
    const rooms = new RoomService(90_000, 200, 0, [0, 0]);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, { name: "可恢复斗地主", gameType: "doudizhu" });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    const restored = new RoomService(90_000, 200, 0, [0, 0]);
    restored.restoreSnapshot(rooms.exportSnapshot());
    expect(restored.get(created.id)).toMatchObject({
      gameType: "doudizhu",
      maxPlayers: 3,
      playerCount: 3,
    });
    const before = restored.getGameView(created.id, owner.id);
    const saved = restored.exportSnapshot().rooms.find((room) => room.id === created.id)?.game;
    if (
      !before ||
      !("kind" in before) ||
      before.kind !== "doudizhu" ||
      !saved ||
      !("kind" in saved) ||
      saved.kind !== "doudizhu"
    ) throw new Error("Missing active Doudizhu game");

    const action = chooseDoudizhuBotAction(saved as DoudizhuGameState, owner.id);
    const after = restored.applyAction(created.id, owner.id, {
      expectedRevision: before.revision,
      expectedPromptId: before.actionPromptId,
      action,
    });
    if (!("kind" in after) || after.kind !== "doudizhu") throw new Error("Missing Doudizhu response");
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it("waits 1-5 seconds before each Doudizhu bot action", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const rooms = new RoomService();
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, { name: "延时测试", gameType: "doudizhu" });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    for (let step = 0; step < 4; step += 1) {
      const view = rooms.getGameView(created.id, owner.id);
      const saved = rooms.exportSnapshot().rooms.find((room) => room.id === created.id)?.game;
      if (
        !view || !("kind" in view) || view.kind !== "doudizhu" ||
        !saved || !("kind" in saved) || saved.kind !== "doudizhu"
      ) throw new Error("Missing Doudizhu state");
      if (view.currentPlayerId !== owner.id) break;
      rooms.applyAction(created.id, owner.id, {
        expectedRevision: view.revision,
        expectedPromptId: view.actionPromptId,
        action: chooseDoudizhuBotAction(saved, owner.id),
      });
    }

    const before = rooms.getGameView(created.id, owner.id);
    if (!before || !("kind" in before) || before.kind !== "doudizhu") throw new Error("Missing Doudizhu view");
    expect(before.currentPlayerId).not.toBe(owner.id);
    vi.advanceTimersByTime(999);
    const unchanged = rooms.getGameView(created.id, owner.id);
    expect(unchanged?.revision).toBe(before.revision);
    vi.advanceTimersByTime(1);
    const after = rooms.getGameView(created.id, owner.id);
    expect(after?.revision).toBeGreaterThan(before.revision);
  });

  it("confirms a rematch and carries the settled bean balances forward", () => {
    const rooms = new RoomService(90_000, 200, 0, [0, 0]);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, { name: "再来一局", gameType: "doudizhu" });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    for (let step = 0; step < 2_000; step += 1) {
      const view = rooms.getGameView(created.id, owner.id);
      if (!view || !("kind" in view) || view.kind !== "doudizhu") throw new Error("Missing Doudizhu view");
      if (view.status === "finished") break;
      const saved = rooms.exportSnapshot().rooms.find((room) => room.id === created.id)?.game;
      if (!saved || !("kind" in saved) || saved.kind !== "doudizhu") throw new Error("Missing game state");
      rooms.applyAction(created.id, owner.id, {
        expectedRevision: view.revision,
        expectedPromptId: view.actionPromptId,
        action: chooseDoudizhuBotAction(saved, owner.id),
      });
    }

    expect(rooms.get(created.id)?.status).toBe("finished");
    const settledGame = rooms.getGameView(created.id, owner.id);
    if (!settledGame || !("kind" in settledGame) || settledGame.kind !== "doudizhu") {
      throw new Error("Missing settled game");
    }
    const settledBalances = settledGame.players.map((player) => player.beans);
    expect(settledBalances.some((balance) => balance !== 10_000)).toBe(true);
    const rematched = rooms.requestRematch(created.id, owner.id);
    expect(rematched.status).toBe("playing");
    const nextGame = rooms.getGameView(created.id, owner.id);
    if (!nextGame || !("kind" in nextGame) || nextGame.kind !== "doudizhu") throw new Error("Missing rematch");
    expect(nextGame.players.map((player) => player.beans)).toEqual(settledBalances);
  });
});
