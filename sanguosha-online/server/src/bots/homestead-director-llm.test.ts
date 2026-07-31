import { describe, expect, it, vi } from "vitest";
import {
  applyHomesteadWorldEventDecision,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  type EstateTownId,
  type HomesteadGameState,
} from "@sanguosha/shared";
import {
  OpenAiCompatibleHomesteadDirectorProvider,
  createHomesteadDirectorDecision,
  type HomesteadDirectorContext,
} from "./homestead-director-llm.js";

const now = Date.UTC(2026, 6, 30, 8);
const ownerId = "owner";

function request(input: {
  readonly townId?: EstateTownId;
  readonly withDisaster?: boolean;
  readonly liveWeather?: boolean;
  readonly context?: HomesteadDirectorContext;
} = {}) {
  const townId = input.townId ?? "greenvale";
  const farm = createFarmingGame({
    ownerId,
    ownerName: "庄主",
    seed: "farm",
    now,
    townId,
  });
  const ranch = createRanchGame({
    ownerId,
    ownerName: "庄主",
    seed: "ranch",
    now,
    townId,
  });
  const mine = createMineGame({
    ownerId,
    ownerName: "庄主",
    seed: "mine",
    now,
    townId,
  });
  let homestead: HomesteadGameState = createHomesteadGame({
    ownerId,
    ownerName: "庄主",
    seed: "homestead",
    now,
    townId,
  });
  if (input.liveWeather) {
    homestead = {
      ...homestead,
      weather: {
        ...homestead.weather,
        source: "live",
        anchorCity: townId === "frostpeak" ? "香格里拉" : "成都",
        observedAt: now,
        temperatureC: -3,
        humidityPercent: 76,
        precipitationMm: 0.4,
        windKph: 18,
        conditionText: "小雪",
        stale: false,
        mechanicsEnabled: true,
        liveHazards: [{
          id: "cold-alert",
          name: "寒潮预警",
          headline: "山区道路可能结冰",
          severity: 2,
          affectsGameplay: true,
          expiresAt: now + 3_600_000,
        }],
      },
    };
  }
  if (input.withDisaster) {
    homestead.disaster = {
      eventId: townId === "frostpeak" ? "cold_snap" : "mountain_seepage",
      ...(townId === "frostpeak"
        ? { contentEventId: "frost_rail_icing" as const }
        : {}),
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };
    homestead = applyHomesteadWorldEventDecision(
      homestead,
      townId === "frostpeak" ? "frost_rail_icing" : "mountain_seepage",
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
    input.context,
  )!;
}

function provider(fetcher: typeof fetch) {
  return new OpenAiCompatibleHomesteadDirectorProvider({
    endpoint: "https://example.invalid/chat",
    apiKey: "secret",
    model: "test-model",
    timeoutMs: 1_000,
    maximumOutputTokens: 64,
    jsonOutput: true,
  }, fetcher);
}

describe("homestead LLM narrative director", () => {
  it("projects all three sectors while keeping the server event fixed", () => {
    const decision = request({
      context: {
        coins: 900,
        localReputation: 17,
        merchantRenown: 3,
        logistics: { used: 4, capacity: 6 },
        merchantCandidates: [
          { itemId: "merchant_banner", canBuy: true, owned: 1 },
          { itemId: "priority_dispatch", canBuy: false },
          { itemId: "rail_pass", canBuy: true, purchasedThisWeek: 1 },
        ],
        economicBottlenecks: ["加工队列缺少矿业材料"],
      },
    });

    expect(decision.input.state).toMatchObject({
      farmLevel: 1,
      ranchLevel: 1,
      mineLevel: 1,
      coins: 900,
      activeTown: "greenvale",
      localReputation: 17,
      merchantRenown: 3,
      logistics: { used: 4, capacity: 6, remaining: 2 },
    });
    expect(decision.input.state.economicBottlenecks).toContain(
      "加工队列缺少矿业材料",
    );
    expect(decision.input.state.merchantCandidates.map(({ itemId }) => itemId))
      .toEqual(["merchant_banner", "rail_pass"]);
    expect(decision.input.state.planCandidates.length).toBeGreaterThanOrEqual(5);
    expect(decision.input.state.playerIntent).toEqual({
      goal: "balanced",
      risk: "balanced",
      focus: "processing",
    });
    expect(decision.input.candidates[0]).toEqual(decision.fallback);
    expect(decision.input.candidates.length).toBeGreaterThan(1);
    expect(decision.input.candidates[0]?.eventId).toBe(
      decision.fallback.eventId,
    );
  });

  it("uses the same projection for Frostpeak without town-specific branches", () => {
    const decision = request({
      townId: "frostpeak",
      liveWeather: true,
      withDisaster: true,
    });

    expect(decision.input.state).toMatchObject({
      activeTown: "frostpeak",
      weather: {
        source: "live",
        anchorCity: "香格里拉",
        condition: "小雪",
        mechanicsEnabled: true,
      },
      disaster: {
        eventId: "cold_snap",
        severity: 1,
        mitigated: false,
      },
    });
    expect(decision.input.state.townName).toBeTruthy();
    expect(decision.input.state.liveHazards).toHaveLength(1);
    expect(decision.input.state.economicBottlenecks).toContain(
      "当前灾害尚未完成处置",
    );
    expect(decision.input.candidates.map(({ eventId }) => eventId))
      .toEqual(["frost_rail_icing"]);
  });

  it("maps a store index to a server-whitelisted display recommendation", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              i: 0,
              t: "三业协作",
              n: "天气变化让三业需要重新安排今日计划。",
              a: "先核对库存与物流余量，再安排加工。",
              l: "稳住每条供应链，庄园才走得远。",
              p: [4, 0, 2],
              s: 1,
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const decision = request({
      liveWeather: true,
      context: {
        coins: 900,
        merchantRenown: 3,
        logistics: { used: 3, capacity: 6 },
        merchantCandidates: [
          { itemId: "priority_dispatch", canBuy: true },
          { itemId: "rail_pass", canBuy: true },
        ],
      },
    });

    const result = await provider(fetcher).decide(decision.input);

    expect(result.candidateIndex).toBe(0);
    expect(result.presentation).toMatchObject({
      title: "三业协作",
      narrative: "天气变化让三业需要重新安排今日计划。",
      recommendation: "先核对库存与物流余量，再安排加工。",
      planStepIndices: [4, 0, 2],
      merchantRecommendationId: "rail_pass",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0]?.content).toContain("服务器已经提供");
    expect(body.messages[1]?.content).toContain(
      "\"event\":\"server_whitelisted_templates\"",
    );
    expect(body.messages[1]?.content).toContain("priority_dispatch");
    expect(body.messages[1]?.content).toContain("成都");
    expect(body.messages[1]?.content).not.toContain("secret");
  });

  it("selects only from the same-town server event template whitelist", async () => {
    const decision = request();
    expect(decision.input.candidates.length).toBeGreaterThan(1);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              i: 1,
              n: "根据当前库存，今天更适合处理另一项本地事务。",
              p: [0, 2, 4],
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await provider(fetcher).decide(decision.input);

    expect(result.candidateIndex).toBe(1);
    expect(decision.input.candidates[1]?.eventId).not.toBe(
      decision.fallback.eventId,
    );
  });

  it("drops an invalid store index without failing safe narrative output", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              i: 0,
              n: "按现有规则继续经营。",
              s: 99,
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await provider(fetcher).decide(request({
      context: {
        coins: 900,
        merchantRenown: 3,
        merchantCandidates: [
          { itemId: "merchant_banner", canBuy: true },
        ],
      },
    }).input);

    expect(result).toMatchObject({
      candidateIndex: 0,
      presentation: { narrative: "按现有规则继续经营。" },
    });
    expect(result.presentation?.merchantRecommendationId).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects attempts to select an event outside the server whitelist", async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":999}" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await provider(fetcher).decide(request().input);

    expect(result).toMatchObject({
      candidateIndex: null,
      failureReason: "invalid_candidate",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("selects event pacing only by a server-provided index", async () => {
    const decision = request();
    expect(decision.input.state.pacingCandidates.map(({ id }) => id))
      .toEqual(["single_day", "two_day_follow_up"]);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({ i: 0, v: 1, p: [0, 1, 2] }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await provider(fetcher).decide(decision.input);

    expect(result).toMatchObject({
      candidateIndex: 0,
      presentation: { eventPacingId: "two_day_follow_up" },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1]?.content).toContain("pacingOptions");
  });

  it("rejects an out-of-range event pacing index", async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":0,\"v\":99}" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await provider(fetcher).decide(request().input);

    expect(result).toMatchObject({
      candidateIndex: null,
      failureReason: "invalid_candidate",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
