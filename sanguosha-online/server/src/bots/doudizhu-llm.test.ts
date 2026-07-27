import {
  applyDoudizhuAction,
  createDoudizhuGame,
  listDoudizhuBotActions,
} from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";
import { BotDecisionRegistry } from "./decision-registry.js";
import {
  OpenAiCompatibleDoudizhuProvider,
  createDoudizhuDecision,
  systemPrompt,
} from "./doudizhu-llm.js";

const players = [
  { id: "11111111-1111-4111-8111-111111111111", name: "one" },
  { id: "22222222-2222-4222-8222-222222222222", name: "two" },
  { id: "33333333-3333-4333-8333-333333333333", name: "three" },
] as const;

describe("Dou Dizhu LLM decision adapter", () => {
  it("sends only a compact private projection and selects a legal candidate index", async () => {
    const game = createDoudizhuGame({
      players,
      seed: "ab".repeat(32),
    });
    const decision = createDoudizhuDecision(
      "room-secret-id",
      game,
      game.currentPlayerId,
      7,
    );
    expect(decision).not.toBeNull();
    if (!decision) throw new Error("Expected a bidding decision");

    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"i\":1}" } }],
      usage: { prompt_tokens: 91, completion_tokens: 5 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const provider = new OpenAiCompatibleDoudizhuProvider({
      endpoint: "https://example.test/v1/chat/completions",
      apiKey: "server-secret",
      model: "small-model",
      timeoutMs: 1_000,
      maximumOutputTokens: 12,
    }, fetcher);

    const result = await provider.decide(decision.input);

    expect(result).toEqual({
      candidateIndex: 1,
      usage: { promptTokens: 91, completionTokens: 5 },
    });
    expect(decision.input.candidates[result.candidateIndex!]).toBeDefined();
    const request = fetcher.mock.calls[0];
    const init = request?.[1];
    const body = JSON.parse(String(init?.body)) as {
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.max_tokens).toBe(12);
    const compactState = body.messages.find((message) => message.role === "user")?.content ?? "";
    expect(compactState.length).toBeLessThan(500);
    expect(compactState).not.toContain("room-secret-id");
    for (const player of players) expect(compactState).not.toContain(player.id);
    expect(String((init?.headers as Record<string, string>).Authorization)).toBe("Bearer server-secret");
  });

  it("uses DeepSeek JSON output with thinking disabled for the token-saving preset", async () => {
    const game = createDoudizhuGame({
      players,
      seed: "ef".repeat(32),
    });
    const decision = createDoudizhuDecision(
      "room",
      game,
      game.currentPlayerId,
      7,
    );
    if (!decision) throw new Error("Expected a bidding decision");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"i\":0}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAiCompatibleDoudizhuProvider({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      timeoutMs: 1_000,
      maximumOutputTokens: 4_000,
      thinkingEnabled: false,
      jsonOutput: true,
    }, fetcher);

    await provider.decide(decision.input);

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      max_tokens: 4_000,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    });
  });

  it("includes public history, bottom cards, and remaining-hand plans", () => {
    let game = createDoudizhuGame({
      players,
      seed: "12".repeat(32),
    });
    const landlordId = game.currentPlayerId;
    game = applyDoudizhuAction(game, {
      type: "doudizhu_bid",
      playerId: landlordId,
      score: 3,
    });
    const opening = listDoudizhuBotActions(game, landlordId, 7)[0];
    if (!opening) throw new Error("Expected a landlord opening");
    game = applyDoudizhuAction(game, opening);
    const decision = createDoudizhuDecision(
      "room",
      game,
      game.currentPlayerId,
      7,
    );
    if (!decision) throw new Error("Expected a follow-up decision");

    expect(decision.input.state.bottomCards).toHaveLength(3);
    expect(decision.input.state.playedRanks.length).toBeGreaterThan(0);
    expect(decision.input.state.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "bid", score: 3 }),
      expect.objectContaining({ type: "play" }),
    ]));
    expect(decision.input.candidates.length).toBeLessThanOrEqual(20);
  });

  it("retries an empty JSON response once and aggregates usage", async () => {
    const game = createDoudizhuGame({
      players,
      seed: "34".repeat(32),
    });
    const decision = createDoudizhuDecision(
      "room",
      game,
      game.currentPlayerId,
      7,
    );
    if (!decision) throw new Error("Expected a bidding decision");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "" } }],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":0}" } }],
        usage: { prompt_tokens: 110, completion_tokens: 5 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAiCompatibleDoudizhuProvider({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      timeoutMs: 10_000,
      maximumOutputTokens: 4_000,
      thinkingEnabled: false,
      jsonOutput: true,
    }, fetcher);

    const result = await provider.decide(decision.input);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      candidateIndex: 0,
      usage: { promptTokens: 210, completionTokens: 5 },
    });
  });

  it("reports the exact reason after two invalid model responses", async () => {
    const game = createDoudizhuGame({
      players,
      seed: "56".repeat(32),
    });
    const decision = createDoudizhuDecision(
      "room",
      game,
      game.currentPlayerId,
      7,
    );
    if (!decision) throw new Error("Expected a bidding decision");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAiCompatibleDoudizhuProvider({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      timeoutMs: 10_000,
      maximumOutputTokens: 4_000,
      thinkingEnabled: false,
      jsonOutput: true,
    }, fetcher);

    const result = await provider.decide(decision.input);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.candidateIndex).toBeNull();
    expect(result.failureReason).toBe("invalid_json");
  });

  it("creates a model decision for every level and varies intelligence only by prompt", () => {
    const game = createDoudizhuGame({
      players,
      seed: "cd".repeat(32),
    });
    const levels = [1, 2, 3, 4, 5, 6, 7] as const;
    const decisions = levels.map((level) =>
      createDoudizhuDecision("room", game, game.currentPlayerId, level)
    );
    expect(decisions.every(Boolean)).toBe(true);
    const candidateSets = decisions.map((decision) =>
      JSON.stringify(decision?.input.candidates)
    );
    expect(new Set(candidateSets)).toHaveLength(1);
    expect(new Set(levels.map(systemPrompt))).toHaveLength(7);
    expect(systemPrompt(1)).toContain("novice");
    expect(systemPrompt(7)).toContain("expert");
  });

  it("rejects a provider index outside the authoritative candidate list", async () => {
    const registry = new BotDecisionRegistry().register("doudizhu", {
      decide: async () => ({
        candidateIndex: 999,
        usage: { promptTokens: 10, completionTokens: 1 },
      }),
    });
    const result = await registry.decide("doudizhu", {
      roomId: "room",
      playerId: players[0].id,
      intelligence: 7,
      state: {},
      candidates: ["legal"],
    });
    expect(result).toEqual({
      candidateIndex: null,
      usage: { promptTokens: 10, completionTokens: 1 },
      failureReason: "invalid_candidate",
    });
  });
});
