import { createDoudizhuGame } from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";
import { BotDecisionRegistry } from "./decision-registry.js";
import {
  EMPTY_DOUDIZHU_LLM_USAGE,
  OpenAiCompatibleDoudizhuProvider,
  createDoudizhuDecision,
  doudizhuLlmBudgetAvailable,
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
    expect(compactState.length).toBeLessThan(1_000);
    expect(compactState).not.toContain("room-secret-id");
    for (const player of players) expect(compactState).not.toContain(player.id);
    expect(String((init?.headers as Record<string, string>).Authorization)).toBe("Bearer server-secret");
  });

  it("skips low-value calls and enforces per-level call and token budgets", () => {
    const game = createDoudizhuGame({
      players,
      seed: "cd".repeat(32),
    });
    expect(createDoudizhuDecision("room", game, game.currentPlayerId, 1)).toBeNull();
    expect(doudizhuLlmBudgetAvailable(7, {
      ...EMPTY_DOUDIZHU_LLM_USAGE,
      calls: 9,
      promptTokens: 3_499,
    })).toBe(true);
    expect(doudizhuLlmBudgetAvailable(7, {
      ...EMPTY_DOUDIZHU_LLM_USAGE,
      calls: 10,
    })).toBe(false);
    expect(doudizhuLlmBudgetAvailable(7, {
      ...EMPTY_DOUDIZHU_LLM_USAGE,
      promptTokens: 3_500,
    })).toBe(false);
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
    });
  });
});
