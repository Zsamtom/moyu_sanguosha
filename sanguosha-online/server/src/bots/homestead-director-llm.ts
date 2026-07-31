import {
  ESTATE_MERCHANT_ITEM_IDS,
  ESTATE_MERCHANT_ITEMS,
  HOMESTEAD_WEATHER,
  HOMESTEAD_WORLD_EVENTS,
  getHomesteadProductionRules,
  getTownDefinition,
  type EstateMerchantItemId,
  type FarmingGameState,
  type HomesteadGameState,
  type HomesteadWorldEventId,
  type MineGameState,
  type RanchGameState,
} from "@sanguosha/shared";
import {
  BotDecisionProviderError,
  type BotDecisionFailureReason,
  type BotDecisionInput,
  type BotDecisionProvider,
  type BotDecisionResult,
} from "./decision-registry.js";
import type { OpenAiCompatibleDoudizhuConfig } from "./doudizhu-llm.js";

export interface HomesteadDirectorCandidate {
  readonly eventId: HomesteadWorldEventId;
  readonly title: string;
  readonly tone: "calm" | "opportunity" | "risk";
}

export interface HomesteadDirectorMerchantCandidate {
  readonly itemId: EstateMerchantItemId;
  readonly owned?: number;
  readonly purchasedThisWeek?: number;
  /**
   * The caller should set this from authoritative account validation.
   * Candidates marked unavailable are still useful as context, but can never
   * be returned as the recommendation.
   */
  readonly canBuy?: boolean;
  readonly disabledReason?: string | null;
}

export interface HomesteadDirectorContext {
  readonly coins?: number;
  readonly localReputation?: number;
  readonly merchantRenown?: number;
  readonly logistics?: {
    readonly used: number;
    readonly capacity: number;
  };
  readonly merchantCandidates?: readonly HomesteadDirectorMerchantCandidate[];
  readonly economicBottlenecks?: readonly string[];
}

interface CompactMerchantCandidate {
  readonly itemId: EstateMerchantItemId;
  readonly name: string;
  readonly category: string;
  readonly coinPrice: number;
  readonly owned: number | null;
  readonly purchasedThisWeek: number | null;
}

export interface HomesteadDirectorCompactState {
  readonly day: string;
  readonly activeTown: string;
  readonly townName: string;
  readonly townClimate: string;
  readonly townLandmark: string;
  readonly farmLevel: number;
  readonly ranchLevel: number;
  readonly mineLevel: number;
  readonly coins: number;
  readonly reputation: number;
  readonly localReputation: number;
  readonly merchantRenown: number;
  readonly researchPoints: number;
  readonly builtFacilities: readonly string[];
  readonly farmStock: number;
  readonly ranchStock: number;
  readonly mineStock: number;
  readonly soilHealth: number;
  readonly herdHealth: number;
  readonly mineProtection: number;
  readonly seasonScore: number;
  readonly npcTrust: readonly string[];
  readonly recentOperations: readonly string[];
  readonly weather: {
    readonly weatherId: string;
    readonly ruleName: string;
    readonly source: string;
    readonly anchorCity: string | null;
    readonly observedAt: number | null;
    readonly condition: string | null;
    readonly temperatureC: number | null;
    readonly humidityPercent: number | null;
    readonly precipitationMm: number | null;
    readonly windKph: number | null;
    readonly stale: boolean;
    readonly mechanicsEnabled: boolean;
  };
  readonly liveHazards: readonly {
    readonly id: string;
    readonly name: string;
    readonly headline: string;
    readonly severity: number;
    readonly affectsGameplay: boolean;
  }[];
  readonly disaster: {
    readonly eventId: HomesteadWorldEventId;
    readonly severity: number;
    readonly remainingDays: number;
    readonly unresolvedDays: number;
    readonly mitigated: boolean;
  } | null;
  readonly productionEffects: readonly {
    readonly sector: "farm" | "ranch" | "mine";
    readonly yieldPercent: number;
    readonly durationPercent: number;
  }[];
  readonly resilience: readonly string[];
  readonly logistics: {
    readonly used: number;
    readonly capacity: number;
    readonly remaining: number;
  } | null;
  readonly merchantCandidates: readonly CompactMerchantCandidate[];
  readonly economicBottlenecks: readonly string[];
  readonly townResources: readonly string[];
  readonly townLandmarkStage: number;
}

export interface HomesteadDirectorRequest {
  readonly input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >;
  /**
   * This is the server-selected event, not an LLM-selected alternative.
   * Keeping the fallback field preserves the previous caller contract.
   */
  readonly fallback: HomesteadDirectorCandidate;
}

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function compactText(value: string, limit: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function isMerchantItemId(value: unknown): value is EstateMerchantItemId {
  return typeof value === "string" &&
    (ESTATE_MERCHANT_ITEM_IDS as readonly string[]).includes(value);
}

function merchantCandidates(
  context: HomesteadDirectorContext | undefined,
  coins: number,
  merchantRenown: number,
): CompactMerchantCandidate[] {
  const supplied: readonly HomesteadDirectorMerchantCandidate[] =
    context?.merchantCandidates ??
      ESTATE_MERCHANT_ITEM_IDS.map((itemId) => ({ itemId }));
  const seen = new Set<EstateMerchantItemId>();
  const result: CompactMerchantCandidate[] = [];
  for (const candidate of supplied) {
    if (
      !isMerchantItemId(candidate.itemId) ||
      seen.has(candidate.itemId) ||
      candidate.canBuy === false
    ) {
      continue;
    }
    const definition = ESTATE_MERCHANT_ITEMS[candidate.itemId];
    // With no authoritative account context, only expose recommendations that
    // are at least affordable and renown-eligible. Purchase validation remains
    // entirely server-side.
    if (
      context?.merchantCandidates === undefined &&
      (
        coins < definition.coinPrice ||
        merchantRenown < definition.requiredRenown
      )
    ) {
      continue;
    }
    seen.add(candidate.itemId);
    result.push({
      itemId: candidate.itemId,
      name: definition.name,
      category: definition.category,
      coinPrice: definition.coinPrice,
      owned: Number.isSafeInteger(candidate.owned)
        ? Math.max(0, candidate.owned ?? 0)
        : null,
      purchasedThisWeek: Number.isSafeInteger(candidate.purchasedThisWeek)
        ? Math.max(0, candidate.purchasedThisWeek ?? 0)
        : null,
    });
  }
  return result.slice(0, ESTATE_MERCHANT_ITEM_IDS.length);
}

function economicBottlenecks(input: {
  readonly farmStock: number;
  readonly ranchStock: number;
  readonly mineStock: number;
  readonly production: ReturnType<typeof getHomesteadProductionRules>;
  readonly logistics: HomesteadDirectorContext["logistics"];
  readonly disasterActive: boolean;
  readonly supplied?: readonly string[];
}): string[] {
  const result: string[] = [];
  for (const item of input.supplied ?? []) {
    const safe = compactText(item, 64);
    if (safe && !result.includes(safe)) result.push(safe);
  }
  if (input.farmStock === 0) result.push("农场基础库存为空");
  if (input.ranchStock === 0) result.push("牧场基础库存为空");
  if (input.mineStock === 0) result.push("矿山基础库存为空");
  if (input.production.farm.yieldPercent < 0) {
    result.push("农场正承受减产压力");
  }
  if (input.production.ranch.yieldPercent < 0) {
    result.push("牧场正承受减产压力");
  }
  if (input.production.mine.yieldPercent < 0) {
    result.push("矿山正承受减产压力");
  }
  if (
    input.logistics &&
    input.logistics.used >= input.logistics.capacity
  ) {
    result.push("今日物流容量已经用尽");
  }
  if (input.disasterActive) result.push("当前灾害尚未完成处置");
  return [...new Set(result)].slice(0, 8);
}

/**
 * Projects authoritative game/account state into a bounded, privacy-safe
 * prompt. The current event is the only event candidate, so the model cannot
 * select weather, disasters, rewards, prices, or any other rules outcome.
 */
export function createHomesteadDirectorDecision(
  homestead: HomesteadGameState,
  farm: FarmingGameState,
  ranch: RanchGameState,
  mine: MineGameState,
  playerId: string,
  context?: HomesteadDirectorContext,
): HomesteadDirectorRequest | null {
  if (
    homestead.ownerId !== playerId ||
    farm.ownerId !== playerId ||
    ranch.ownerId !== playerId ||
    mine.ownerId !== playerId
  ) {
    return null;
  }

  const eventDefinition =
    HOMESTEAD_WORLD_EVENTS[homestead.worldEvent.eventId];
  const fixedEvent: HomesteadDirectorCandidate = {
    eventId: eventDefinition.id,
    title: eventDefinition.title,
    tone: eventDefinition.tone,
  };
  const production = getHomesteadProductionRules(homestead);
  const activeTownId = homestead.townId ??
    homestead.townNetwork?.activeTownId ??
    "greenvale";
  const townDefinition = getTownDefinition(activeTownId);
  const activeTown = homestead.townNetwork?.towns[activeTownId];
  const farmStock = total(farm.produce);
  const ranchStock = total(ranch.products);
  const mineStock = total(mine.ores);
  const coins = context?.coins ?? farm.coins;
  const merchantRenown = context?.merchantRenown ??
    homestead.townNetwork?.merchantRenown ??
    0;
  const shopCandidates = merchantCandidates(
    context,
    coins,
    merchantRenown,
  );
  const logistics = context?.logistics
    ? {
        used: Math.max(0, context.logistics.used),
        capacity: Math.max(0, context.logistics.capacity),
        remaining: Math.max(
          0,
          context.logistics.capacity - context.logistics.used,
        ),
      }
    : null;

  return {
    input: {
      roomId: "persistent-homestead",
      playerId,
      intelligence: 7,
      state: {
        day: homestead.dayKey,
        activeTown: activeTownId,
        townName: townDefinition.name,
        townClimate: townDefinition.climate,
        townLandmark: townDefinition.landmarkName,
        farmLevel: farm.level,
        ranchLevel: ranch.level,
        mineLevel: mine.level,
        coins,
        reputation: homestead.reputation,
        localReputation: context?.localReputation ??
          activeTown?.reputation ??
          homestead.reputation,
        merchantRenown,
        researchPoints: homestead.researchPoints,
        builtFacilities: homestead.facilities
          .filter(({ built }) => built)
          .map(({ id }) => id),
        farmStock,
        ranchStock,
        mineStock,
        soilHealth: homestead.specializations.farm.soilHealth,
        herdHealth: homestead.specializations.ranch.herdHealth,
        mineProtection: homestead.specializations.mine.protectionLevel,
        seasonScore: homestead.season.score,
        npcTrust: homestead.npcs.map(
          ({ npcId, trust }) => `${npcId}:${trust}`,
        ),
        recentOperations: homestead.logs
          .slice(0, 6)
          .map(({ message }) =>
            compactText(message.replaceAll(homestead.ownerName, "庄主"), 120)
          ),
        weather: {
          weatherId: homestead.weather.weatherId,
          ruleName: HOMESTEAD_WEATHER[homestead.weather.weatherId].name,
          source: homestead.weather.source ?? "rules",
          anchorCity: homestead.weather.anchorCity ?? null,
          observedAt: homestead.weather.observedAt ?? null,
          condition: homestead.weather.conditionText ?? null,
          temperatureC: homestead.weather.temperatureC ?? null,
          humidityPercent: homestead.weather.humidityPercent ?? null,
          precipitationMm: homestead.weather.precipitationMm ?? null,
          windKph: homestead.weather.windKph ?? null,
          stale: homestead.weather.stale ?? false,
          mechanicsEnabled: homestead.weather.mechanicsEnabled ?? true,
        },
        liveHazards: (homestead.weather.liveHazards ?? [])
          .slice(0, 6)
          .map((hazard) => ({
            id: compactText(hazard.id, 48),
            name: compactText(hazard.name, 64),
            headline: compactText(hazard.headline, 120),
            severity: hazard.severity,
            affectsGameplay: hazard.affectsGameplay,
          })),
        disaster: homestead.disaster
          ? {
              eventId: homestead.disaster.eventId,
              severity: homestead.disaster.severity,
              remainingDays: homestead.disaster.remainingDays,
              unresolvedDays: homestead.disaster.unresolvedDays,
              mitigated: homestead.disaster.mitigated,
            }
          : null,
        productionEffects: [
          {
            sector: "farm",
            yieldPercent: production.farm.yieldPercent,
            durationPercent: production.farm.durationPercent,
          },
          {
            sector: "ranch",
            yieldPercent: production.ranch.yieldPercent,
            durationPercent: production.ranch.durationPercent,
          },
          {
            sector: "mine",
            yieldPercent: production.mine.yieldPercent,
            durationPercent: production.mine.durationPercent,
          },
        ],
        resilience: Object.entries(homestead.resilience)
          .map(([id, level]) => `${id}:${level}`),
        logistics,
        merchantCandidates: shopCandidates,
        economicBottlenecks: economicBottlenecks({
          farmStock,
          ranchStock,
          mineStock,
          production,
          logistics: context?.logistics,
          disasterActive: homestead.disaster !== null,
          supplied: context?.economicBottlenecks,
        }),
        townResources: activeTown
          ? Object.entries(activeTown.inventory)
            .map(([id, quantity]) => `${id}:${quantity}`)
            .slice(0, 24)
          : [],
        townLandmarkStage: activeTown?.landmarkStage ?? 0,
      },
      candidates: [fixedEvent],
    },
    fallback: fixedEvent,
  };
}

const SYSTEM_PROMPT = [
  "你是多城镇三业庄园的每日叙事导演。",
  "服务器已经决定了当前事件、真实天气、灾害、数值倍率、价格、成本和奖励；你不得改选、改写或新增这些规则。",
  "你只能依据当前城镇、农场、牧场、矿山、天气与灾害、物流容量、经济瓶颈和最近操作，生成展示用叙事与经营建议。",
  "商店建议只能填写 shopOptions 中的索引 s；它只是展示建议，不会自动购买或生效。",
  "不得编造物品、NPC、城镇、灾害、奖励、成本、价格、倍率或产量数字。",
  "只返回 JSON：{\"i\":0,\"t\":\"短标题\",\"n\":\"不超过120字的叙事\",\"a\":\"不超过80字的经营建议\",\"l\":\"不超过50字的NPC台词\",\"s\":0}。没有合适商店建议时省略 s。",
].join("");

function compactPrompt(
  input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >,
): string {
  const fixedEvent = input.candidates[0];
  return JSON.stringify({
    authority: {
      event: "server_fixed",
      weather: "server_fixed",
      disaster: "server_fixed",
      economy: "server_fixed",
      llmOutput: "presentation_only",
    },
    state: input.state,
    fixedEvent: fixedEvent
      ? {
          i: 0,
          id: fixedEvent.eventId,
          title: fixedEvent.title,
          tone: fixedEvent.tone,
        }
      : null,
    shopOptions: input.state.merchantCandidates.map((candidate, index) => ({
      s: index,
      ...candidate,
    })),
  });
}

function responseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string"
    ? first.message.content
    : null;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function parseCandidate(
  completion: string,
  merchantCandidateIds: readonly EstateMerchantItemId[],
): {
  index: number | null;
  reason?: BotDecisionFailureReason;
  presentation?: BotDecisionResult["presentation"];
} {
  if (!completion.trim()) {
    return { index: null, reason: "empty_content" };
  }
  try {
    const value = JSON.parse(completion) as {
      i?: unknown;
      t?: unknown;
      n?: unknown;
      a?: unknown;
      l?: unknown;
      s?: unknown;
    };
    // The event has already been fixed by the server. Index zero is the only
    // legal value even if a future caller accidentally supplies more events.
    if (value.i !== 0) {
      return { index: null, reason: "invalid_candidate" };
    }
    const safeText = (candidate: unknown, limit: number): string | undefined => {
      if (typeof candidate !== "string") return undefined;
      const text = compactText(candidate, limit);
      return text || undefined;
    };
    const merchantRecommendationId =
      Number.isSafeInteger(value.s) &&
        Number(value.s) >= 0 &&
        Number(value.s) < merchantCandidateIds.length
        ? merchantCandidateIds[Number(value.s)]
        : undefined;
    return {
      index: 0,
      presentation: {
        title: safeText(value.t, 60),
        narrative: safeText(value.n, 160),
        recommendation: safeText(value.a, 100),
        npcLine: safeText(value.l, 80),
        ...(merchantRecommendationId
          ? { merchantRecommendationId }
          : {}),
      },
    };
  } catch {
    return { index: null, reason: "invalid_json" };
  }
}

type FetchLike = typeof fetch;

export class OpenAiCompatibleHomesteadDirectorProvider implements
  BotDecisionProvider<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  > {
  constructor(
    private readonly config: OpenAiCompatibleDoudizhuConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async decide(
    input: BotDecisionInput<
      HomesteadDirectorCompactState,
      HomesteadDirectorCandidate
    >,
  ): Promise<BotDecisionResult> {
    if (input.candidates.length === 0) {
      return {
        candidateIndex: null,
        usage: { promptTokens: 0, completionTokens: 0 },
        failureReason: "invalid_candidate",
      };
    }
    const prompt = compactPrompt(input);
    const merchantCandidateIds = input.state.merchantCandidates
      .map(({ itemId }) => itemId)
      .filter(isMerchantItemId);
    const usage = { promptTokens: 0, completionTokens: 0 };
    let failureReason: BotDecisionFailureReason = "invalid_json";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = attempt === 0
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT} 上一次输出无效，请只输出一个 JSON 对象，且 i 必须为 0。`;
      const payload = await this.request(instruction, prompt);
      const completion = responseText(payload) ?? "";
      usage.promptTokens += estimateTokens(`${instruction}\n${prompt}`);
      usage.completionTokens += estimateTokens(completion);
      const parsed = parseCandidate(completion, merchantCandidateIds);
      if (parsed.index !== null) {
        return {
          candidateIndex: 0,
          usage,
          presentation: parsed.presentation,
        };
      }
      failureReason = parsed.reason ?? "invalid_candidate";
    }
    return { candidateIndex: null, usage, failureReason };
  }

  private async request(instruction: string, prompt: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timeout.unref();
    try {
      let response: Response;
      try {
        response = await this.fetcher(this.config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: "system", content: instruction },
              { role: "user", content: prompt },
            ],
            temperature: 0,
            max_tokens: this.config.maximumOutputTokens,
            ...(this.config.thinkingEnabled === undefined
              ? {}
              : {
                  thinking: {
                    type: this.config.thinkingEnabled
                      ? "enabled"
                      : "disabled",
                  },
                }),
            ...(this.config.jsonOutput
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        throw new BotDecisionProviderError(
          timedOut ? "timeout" : "network_error",
          timedOut
            ? "Homestead director request timed out"
            : "Homestead director network request failed",
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new BotDecisionProviderError(
          "http_error",
          `Homestead director request failed with HTTP ${response.status}`,
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw new BotDecisionProviderError(
          "invalid_json",
          "Homestead director response envelope was not valid JSON",
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
