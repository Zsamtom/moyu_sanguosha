import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseDoudizhuBotAction, type DoudizhuGameState } from "@sanguosha/shared";
import type { PublicUser } from "./users.js";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
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
    const created = rooms.create(owner, {
      name: "可恢复斗地主",
      gameType: "doudizhu",
      botMode: "llm",
    });
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
      botMode: "llm",
      llmBot: {
        available: false,
        usage: { calls: 0, promptTokens: 0, completionTokens: 0, fallbacks: 0 },
      },
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

  it("uses the optional asynchronous decision provider and records token usage", async () => {
    const decide = vi.fn(async () => ({
      candidateIndex: 0,
      usage: { promptTokens: 73, completionTokens: 4 },
    }));
    const registry = new BotDecisionRegistry().register("doudizhu", { decide });
    const rooms = new RoomService(90_000, 200, 0, [0, 0], registry);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "大模型斗地主",
      gameType: "doudizhu",
      botIntelligence: 1,
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    for (let step = 0; step < 3 && decide.mock.calls.length === 0; step += 1) {
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
        action: chooseDoudizhuBotAction(saved, owner.id, 7),
      });
      await Promise.resolve();
    }

    await vi.waitFor(() => expect(decide).toHaveBeenCalled());
    await vi.waitFor(() => {
      const llmBot = rooms.get(created.id)?.llmBot;
      expect(llmBot?.available).toBe(true);
      expect(llmBot?.usage.calls).toBe(decide.mock.calls.length);
      expect(llmBot?.usage.promptTokens).toBeGreaterThanOrEqual(73 * decide.mock.calls.length);
      expect(llmBot?.usage.completionTokens).toBe(4 * decide.mock.calls.length);
      expect(llmBot?.usage.fallbacks).toBe(0);
    });
  });

  it("lets the current human request an LLM recommendation without auto-playing it", async () => {
    let resolveDecision!: (result: {
      candidateIndex: number;
      usage: { promptTokens: number; completionTokens: number };
    }) => void;
    const decide = vi.fn(() => new Promise<{
      candidateIndex: number;
      usage: { promptTokens: number; completionTokens: number };
    }>((resolve) => {
      resolveDecision = resolve;
    }));
    const registry = new BotDecisionRegistry().register("doudizhu", { decide });
    const rooms = new RoomService(90_000, 200, 0, [0, 0], registry);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "真人推荐",
      gameType: "doudizhu",
      botIntelligence: 4,
      botMode: "rules",
    });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    await vi.waitFor(() => {
      const view = rooms.getGameView(created.id, owner.id);
      expect(view && "currentPlayerId" in view ? view.currentPlayerId : null)
        .toBe(owner.id);
      expect(rooms.get(created.id)?.llmBot.thinkingPlayerId).toBeNull();
    });
    const before = rooms.getGameView(created.id, owner.id);
    if (!before || !("kind" in before) || before.kind !== "doudizhu") {
      throw new Error("Missing Doudizhu view");
    }

    const recommendationPromise = rooms.recommendDoudizhuAction(
      created.id,
      owner.id,
    );
    await vi.waitFor(() => {
      expect(rooms.get(created.id)?.llmBot.thinkingPlayerId).toBe(owner.id);
    });
    resolveDecision({
      candidateIndex: 0,
      usage: { promptTokens: 61, completionTokens: 4 },
    });
    const recommendation = await recommendationPromise;
    const after = rooms.getGameView(created.id, owner.id);

    expect(recommendation.source).toBe("llm");
    expect(recommendation.action.playerId).toBe(owner.id);
    expect(after?.revision).toBe(before.revision);
    expect(rooms.get(created.id)?.llmBot.thinkingPlayerId).toBeNull();
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({
      playerId: owner.id,
      intelligence: 4,
    }));
    expect(rooms.get(created.id)?.llmBot.usage).toMatchObject({
      calls: 1,
      promptTokens: expect.any(Number),
      completionTokens: 4,
      fallbacks: 0,
    });
  });

  it("publishes the exact bot that is currently waiting for an LLM decision", async () => {
    let resolveDecision!: (result: {
      candidateIndex: number;
      usage: { promptTokens: number; completionTokens: number };
    }) => void;
    let firstDecision = true;
    const decide = vi.fn(() => {
      if (!firstDecision) {
        return Promise.resolve({
          candidateIndex: 0,
          usage: { promptTokens: 73, completionTokens: 4 },
        });
      }
      firstDecision = false;
      return new Promise<{
        candidateIndex: number;
        usage: { promptTokens: number; completionTokens: number };
      }>((resolve) => {
        resolveDecision = resolve;
      });
    });
    const registry = new BotDecisionRegistry().register("doudizhu", { decide });
    const rooms = new RoomService(90_000, 200, 0, [0, 0], registry);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "思考状态",
      gameType: "doudizhu",
      botIntelligence: 7,
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    for (let step = 0; step < 3 && decide.mock.calls.length === 0; step += 1) {
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
        action: chooseDoudizhuBotAction(saved, owner.id, 1),
      });
    }

    await vi.waitFor(() => expect(decide).toHaveBeenCalled());
    const thinkingPlayerId = rooms.get(created.id)?.llmBot.thinkingPlayerId;
    expect(thinkingPlayerId).toBeTruthy();
    expect(
      rooms.get(created.id)?.players.find((player) => player.id === thinkingPlayerId)?.isBot,
    ).toBe(true);

    resolveDecision({
      candidateIndex: 0,
      usage: { promptTokens: 73, completionTokens: 4 },
    });
    await vi.waitFor(() => {
      expect(rooms.get(created.id)?.llmBot.thinkingPlayerId).toBeNull();
    });
  });

  it("falls back to the rule bot when the optional provider fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const decide = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const registry = new BotDecisionRegistry().register("doudizhu", { decide });
    const rooms = new RoomService(90_000, 200, 0, [0, 0], registry);
    rooms.setConnected(owner.id, true);
    const created = rooms.create(owner, {
      name: "自动回退",
      gameType: "doudizhu",
      botIntelligence: 7,
      botMode: "llm",
    });
    rooms.addBot(created.id, owner.id);
    rooms.addBot(created.id, owner.id);
    rooms.setReady(created.id, owner.id, true);
    rooms.start(created.id, owner.id);

    for (let step = 0; step < 3 && decide.mock.calls.length === 0; step += 1) {
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
        action: chooseDoudizhuBotAction(saved, owner.id, 7),
      });
      await Promise.resolve();
    }

    await vi.waitFor(() => expect(decide).toHaveBeenCalled());
    await vi.waitFor(() => {
      expect(rooms.get(created.id)?.llmBot.usage.fallbacks).toBeGreaterThan(0);
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("using rule fallback"),
      expect.any(Error),
    );
  });
});
