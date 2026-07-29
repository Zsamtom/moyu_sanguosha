import { describe, expect, it, vi } from "vitest";
import {
  applyFarmAction,
  createFarmGame,
} from "@sanguosha/shared";
import {
  createFarmMarketDecision,
  OpenAiCompatibleFarmMarketProvider,
} from "./farm-market-llm.js";

describe("farm market LLM", () => {
  it("projects anonymous farm data and accepts a legal candidate index", async () => {
    const playerId = "private-account-id";
    const playerName = "私人昵称";
    let game = createFarmGame({
      players: [{ id: playerId, name: playerName }],
      seed: "market-test",
    });
    game = applyFarmAction(game, {
      type: "farm_buy_seed",
      playerId,
      cropId: "wheat",
      quantity: 1,
    });
    game = applyFarmAction(game, {
      type: "farm_end_turn",
      playerId,
    });
    const decision = createFarmMarketDecision(game, playerId);
    expect(decision).not.toBeNull();

    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":2}" } }],
        usage: { prompt_tokens: 42, completion_tokens: 4 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const provider = new OpenAiCompatibleFarmMarketProvider({
      endpoint: "https://example.test/chat/completions",
      apiKey: "secret",
      model: "test-model",
      timeoutMs: 1_000,
      maximumOutputTokens: 16,
      jsonOutput: true,
    }, fetcher as typeof fetch);
    const result = await provider.decide(decision!.input);

    expect(result).toEqual({
      candidateIndex: 2,
      usage: { promptTokens: 42, completionTokens: 4 },
    });
    const body = String(fetcher.mock.calls[0]![1]?.body);
    expect(body).not.toContain(playerId);
    expect(body).not.toContain(playerName);
    expect(body).toContain("餐饮订单增长");
  });

  it("falls back after two invalid model replies", async () => {
    const game = createFarmGame({
      players: [{ id: "farmer", name: "经营者" }],
      seed: "invalid-response",
    });
    const decision = createFarmMarketDecision(game, "farmer")!;
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "not-json" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const provider = new OpenAiCompatibleFarmMarketProvider({
      endpoint: "https://example.test/chat/completions",
      apiKey: "secret",
      model: "test-model",
      timeoutMs: 1_000,
      maximumOutputTokens: 16,
    }, fetcher as typeof fetch);

    await expect(provider.decide(decision.input)).resolves.toMatchObject({
      candidateIndex: null,
      failureReason: "invalid_json",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
