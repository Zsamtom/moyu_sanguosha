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
  readonly withAdvisorContext?: boolean;
  readonly profileEnabled?: boolean;
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
  if (input.withAdvisorContext) {
    homestead.npcs[0]!.trust = 3;
    homestead.npcs[0]!.facts = Array.from({ length: 8 }, (_, index) => ({
      key: `soil:${index}`,
      value: `第 ${index + 1} 条土壤经营事实`,
      at: now - index,
    }));
    homestead.advisorGuidance.farm = {
      dayKey: homestead.dayKey,
      npcId: homestead.npcs[0]!.npcId,
      topicId: "soil",
      sectorId: "farm",
      yieldPercent: 5,
      durationPercent: 0,
      label: "本地农事指导：产出 +5%",
    };
    homestead.infrastructure.operations_center = 2;
    homestead.honor.score = 180;
  }
  if (input.profileEnabled !== undefined) {
    homestead.aiProfile.enabled = input.profileEnabled;
  }
  if (input.liveWeather) {
    homestead = {
      ...homestead,
      resilience: {
        ...homestead.resilience,
        weather_station: 1,
      },
      weather: {
        ...homestead.weather,
        source: "live",
        anchorCity: townId === "frostpeak" ? "拉萨" : "郑州",
        observedAt: now,
        temperatureC: -3,
        humidityPercent: 76,
        precipitationMm: 0.4,
        windKph: 18,
        conditionText: "小雪",
        stale: false,
        mechanicsEnabled: true,
        forecastAvailable: true,
        forecast: [{
          forecastStartAt: now + 86_400_000,
          forecastEndAt: now + 2 * 86_400_000,
          weatherId: "frost",
          conditionCode: "150",
          conditionText: "小雪",
          temperatureMinC: -8,
          temperatureMaxC: -2,
          precipitationMm: 1.2,
          precipitationProbabilityPercent: 70,
          humidityPercent: 82,
          windSpeedKph: 20,
        }],
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
  it("keeps the director backstage for legacy saves with the old toggle disabled", () => {
    expect(request({ profileEnabled: false })).toBeDefined();
  });

  it("projects all three sectors while keeping the server event fixed", () => {
    const decision = request({
      withAdvisorContext: true,
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
        townProgress: [
          {
            townId: "greenvale",
            townName: "青禾镇",
            active: true,
            unlocked: true,
            localReputation: 17,
            farmLevel: 5,
            ranchLevel: 4,
            mineLevel: 3,
            landmarkStage: 1,
          },
          {
            townId: "frostpeak",
            townName: "霜岭镇",
            active: false,
            unlocked: true,
            localReputation: 8,
            farmLevel: 2,
            ranchLevel: 2,
            mineLevel: 1,
            landmarkStage: 0,
          },
        ],
        shipments: [{
          cargoName: "高寒冷链特产箱",
          fromTown: "霜岭镇",
          toTown: "青禾镇",
          status: "ready",
          secondsRemaining: 0,
          canCollect: true,
        }],
        cargoRoutes: [{
          cargoName: "河谷温室支援箱",
          fromTown: "青禾镇",
          toTown: "霜岭镇",
          canDispatch: false,
          disabledReason: "本地特色物资不足",
          missingResources: ["farm/cotton 0/2"],
        }],
        valueRouteDeficits: ["河谷冷链展销缺口：cargo 0/1"],
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
    expect(decision.input.state.planCandidates).toContainEqual(
      expect.objectContaining({
        id: "review-intertown-logistics",
        targetId: "homestead-town-trade",
        title: "领取跨城到货",
      }),
    );
    expect(decision.input.state.shipments[0]?.status).toBe("ready");
    expect(decision.input.state.valueRouteDeficits).toContain(
      "河谷冷链展销缺口：cargo 0/1",
    );
    expect(decision.input.state.playerIntent).toEqual({
      goal: "balanced",
      risk: "balanced",
      focus: "processing",
    });
    expect(decision.input.state.honorScore).toBe(180);
    expect(decision.input.state).not.toHaveProperty("seasonScore");
    expect(decision.input.state.advisorMemories[0]).toMatchObject({
      advisorName: "林禾",
      trust: 3,
    });
    expect(decision.input.state.advisorMemories[0]?.facts).toHaveLength(8);
    expect(decision.input.state.activeGuidance[0]).toContain("产出 +5%");
    expect(decision.input.state.infrastructure).toContain(
      "operations_center:LV2",
    );
    expect(decision.input.state.townRhythm).toMatchObject({
      name: "河谷水肥循环",
      progress: 0,
      nextSector: "farm",
    });
    expect(decision.input.state.researchFrontier[0]?.milestones[0])
      .toContain("未达成");
    expect(decision.input.state.evidenceFacts.length).toBeGreaterThanOrEqual(4);
    expect(decision.input.state.directorBeatCandidates.map(({ id }) => id))
      .toEqual([
        "recovery",
        "pressure",
        "opportunity",
        "community",
        "discovery",
        "trade",
      ]);
    expect(decision.input.state.planCandidates).toContainEqual(
      expect.objectContaining({
        id: "advance-town-rhythm",
        targetId: "homestead-town-rhythm",
      }),
    );
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
        anchorCity: "拉萨",
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
    expect(decision.input.state.forecast).toMatchObject([
      { condition: "小雪", precipitationProbabilityPercent: 70 },
    ]);
    expect(decision.input.state.economicBottlenecks).toContain(
      "当前灾害尚未完成处置",
    );
    expect(decision.input.state.advisorMemories.map(({ advisorName }) =>
      advisorName
    )).toEqual(["洛桑次仁", "德吉央金", "索朗多吉"]);
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
              b: 4,
              d: 1,
              e: [1, 3],
              f: "若今日完成河谷循环，明日研究前沿可能出现新的突破口。",
              p: [4, 0, 2],
              s: 1,
            }),
          },
        }],
        usage: { prompt_tokens: 123, completion_tokens: 45 },
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
      directorBeatId: "discovery",
      advisorIndex: 1,
      evidenceIndices: [1, 3],
      foreshadowing: "若今日完成河谷循环，明日研究前沿可能出现新的突破口。",
      planStepIndices: [4, 0, 2],
      merchantRecommendationId: "rail_pass",
    });
    expect(result.usage).toEqual({ promptTokens: 123, completionTokens: 45 });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0]?.content).toContain("服务器已经提供");
    expect(body.messages[1]?.content).toContain(
      "\"event\":\"server_whitelisted_templates\"",
    );
    expect(body.messages[1]?.content).toContain("priority_dispatch");
    expect(body.messages[1]?.content).toContain("directorBeatOptions");
    expect(body.messages[1]?.content).toContain("evidenceOptions");
    expect(body.messages[1]?.content).toContain("advisorOptions");
    expect(body.messages[1]?.content).toContain("郑州");
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
