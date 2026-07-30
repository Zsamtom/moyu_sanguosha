import { describe, expect, it, vi } from "vitest";
import {
  createFarmingGame,
  createHomesteadGame,
  applyHomesteadWorldEventDecision,
  createMineGame,
  createRanchGame,
} from "@sanguosha/shared";
import {
  OpenAiCompatibleHomesteadDirectorProvider,
  createHomesteadDirectorDecision,
} from "./homestead-director-llm.js";

const now = Date.UTC(2026, 6, 30, 8);
const ownerId = "owner";

function request(withDisaster = false) {
  const farm = createFarmingGame({
    ownerId,
    ownerName: "庄主",
    seed: "farm",
    now,
  });
  const ranch = createRanchGame({
    ownerId,
    ownerName: "庄主",
    seed: "ranch",
    now,
  });
  const mine = createMineGame({
    ownerId,
    ownerName: "庄主",
    seed: "mine",
    now,
  });
  let homestead = createHomesteadGame({
    ownerId,
    ownerName: "庄主",
    seed: "homestead",
    now,
  });
  if (withDisaster) {
    homestead = applyHomesteadWorldEventDecision(
      homestead,
      "mountain_seepage",
      "rules",
      now,
    );
  }
  return createHomesteadDirectorDecision(
    homestead,
    farm,
    ranch,
    mine,
    ownerId,
  )!;
}

describe("homestead LLM world director", () => {
  it("projects all three sectors into bounded legal candidates", () => {
    const decision = request();

    expect(decision.input.state).toMatchObject({
      farmLevel: 1,
      ranchLevel: 1,
      mineLevel: 1,
      coins: 100,
      activeTown: "greenvale",
      localReputation: 0,
      merchantRenown: 0,
    });
    expect(decision.input.candidates).toHaveLength(2);
    expect(decision.input.candidates.map(({ eventId }) => eventId)).toEqual([
      "steady_weather",
      "harvest_festival",
    ]);
    expect(request(true).input.candidates.map(({ eventId }) => eventId))
      .toEqual(["mountain_seepage"]);
  });

  it("can only return a candidate index from the server list", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              i: 1,
              t: "庆典协作",
              n: "庆典让三业重新安排今日计划。",
              a: "先核对库存，再决定摊位方案。",
              l: "稳定协作比短期冲量重要。",
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new OpenAiCompatibleHomesteadDirectorProvider({
      endpoint: "https://example.invalid/chat",
      apiKey: "secret",
      model: "test-model",
      timeoutMs: 1_000,
      maximumOutputTokens: 32,
      jsonOutput: true,
    }, fetcher);

    const result = await provider.decide(request().input);

    expect(result.candidateIndex).toBe(1);
    expect(result.presentation).toMatchObject({
      title: "庆典协作",
      narrative: "庆典让三业重新安排今日计划。",
      recommendation: "先核对库存，再决定摊位方案。",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1]?.content).toContain("harvest_festival");
    expect(body.messages[1]?.content).not.toContain("secret");
  });

  it("falls back after two invalid selections", async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":99}" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const provider = new OpenAiCompatibleHomesteadDirectorProvider({
      endpoint: "https://example.invalid/chat",
      apiKey: "secret",
      model: "test-model",
      timeoutMs: 1_000,
      maximumOutputTokens: 32,
    }, fetcher);

    const result = await provider.decide(request().input);

    expect(result).toMatchObject({
      candidateIndex: null,
      failureReason: "invalid_candidate",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
