import {
  ESTATE_MERCHANT_ITEM_IDS,
  ESTATE_MERCHANT_ITEMS,
  HOMESTEAD_WEATHER,
  HOMESTEAD_WORLD_EVENTS,
  getHomesteadProductionRules,
  getTownDefinition,
  type EstateMerchantItemId,
  type FarmingGameState,
  type HomesteadAdviceStep,
  type HomesteadGameState,
  type HomesteadGeneratedEventPacingId,
  type HomesteadResource,
  type HomesteadWorldEventOption,
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

export interface HomesteadDirectorPlanCandidate extends HomesteadAdviceStep {}
export interface HomesteadDirectorPacingCandidate {
  readonly id: HomesteadGeneratedEventPacingId;
  readonly label: string;
  readonly durationDays: 1 | 2;
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
  readonly planCandidates: readonly HomesteadDirectorPlanCandidate[];
  readonly pacingCandidates: readonly HomesteadDirectorPacingCandidate[];
  readonly playerIntent: {
    readonly goal: string;
    readonly risk: string;
    readonly focus: string;
  };
}

export interface HomesteadDirectorRequest {
  readonly input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >;
  /**
   * Deterministic server fallback used when the optional model is unavailable
   * or returns an invalid candidate.
   */
  readonly fallback: HomesteadDirectorCandidate;
}

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function eventOptionExecutable(
  option: HomesteadWorldEventOption,
  homestead: HomesteadGameState,
  farm: FarmingGameState,
  ranch: RanchGameState,
  mine: MineGameState,
  coins: number,
): boolean {
  if (
    option.coinCost > coins ||
    homestead.reputation + option.reputationReward < 0
  ) {
    return false;
  }
  const available = (resource: HomesteadResource): number => {
    if (resource.source === "goods") {
      return homestead.goods[resource.itemId] ?? 0;
    }
    if (resource.source === "farm") {
      return farm.produce[resource.itemId] ?? 0;
    }
    if (resource.source === "ranch") {
      return ranch.products[resource.itemId] ?? 0;
    }
    return mine.ores[resource.itemId] ?? 0;
  };
  return option.costs.every(
    (resource) => available(resource) >= resource.quantity,
  );
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
 * prompt. Normal events may expose a small same-town template whitelist;
 * weather, disasters, rewards, prices, and all option effects remain fixed.
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
  if (homestead.aiProfile?.enabled === false) return null;

  const activeTownId = homestead.townId ??
    homestead.townNetwork?.activeTownId ??
    "greenvale";
  const availableCoins = context?.coins ?? farm.coins;
  const eventDefinition =
    HOMESTEAD_WORLD_EVENTS[homestead.worldEvent.eventId];
  const fixedEvent: HomesteadDirectorCandidate = {
    eventId: eventDefinition.id,
    title: eventDefinition.title,
    tone: eventDefinition.tone,
  };
  const eventCandidates: HomesteadDirectorCandidate[] =
    homestead.disaster || eventDefinition.hazard
      ? [fixedEvent]
      : [
          fixedEvent,
          ...Object.values(HOMESTEAD_WORLD_EVENTS)
            .filter((candidate) => {
              const candidateTownId =
                candidate.townId ?? "greenvale";
              return (
                candidate.id !== fixedEvent.eventId &&
                candidateTownId === activeTownId &&
                candidate.hazard === undefined &&
                candidate.options.some(
                  (option) => eventOptionExecutable(
                    option,
                    homestead,
                    farm,
                    ranch,
                    mine,
                    availableCoins,
                  ),
                )
              );
            })
            .slice(0, 3)
            .map((candidate) => ({
              eventId: candidate.id,
              title: candidate.title,
              tone: candidate.tone,
            })),
        ];
  const production = getHomesteadProductionRules(homestead);
  const pacingCandidates: readonly HomesteadDirectorPacingCandidate[] = [
    {
      id: "single_day",
      label: "single-day resolution",
      durationDays: 1,
    },
    ...(
      homestead.disaster || eventDefinition.hazard
        ? []
        : [{
            id: "two_day_follow_up" as const,
            label: "two-day follow-up",
            durationDays: 2 as const,
          }]
    ),
  ];
  const townDefinition = getTownDefinition(activeTownId);
  const activeTown = homestead.townNetwork?.towns[activeTownId];
  const farmStock = total(farm.produce);
  const ranchStock = total(ranch.products);
  const mineStock = total(mine.ores);
  const coins = availableCoins;
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
  const planCandidates: HomesteadDirectorPlanCandidate[] = [
    {
      id: "review-event",
      title: "处理今日事件",
      reason: homestead.disaster
        ? "当前事件与持续灾害相关，应先确认可行处置方案。"
        : "事件选择会影响今天的资源和发展节奏。",
      panel: "today",
      targetId: "homestead-world-event",
    },
    {
      id: "review-weather",
      title: "核对环境影响",
      reason: homestead.disaster
        ? "灾害正在影响产业与物流，需要确认减产和工期变化。"
        : "天气效果会在生产开始时固化到本轮。",
      panel: "today",
      targetId: "homestead-weather",
    },
    {
      id: "stabilize-processing",
      title: "安排加工队列",
      reason:
        farmStock + ranchStock + mineStock < 12
          ? "当前基础库存偏紧，先处理短链加工和已完成任务。"
          : "基础库存能够支撑加工，适合减少设施空转。",
      panel: "operations",
      targetId: "homestead-processing",
    },
    {
      id: "review-orders",
      title: "检查联合订单",
      reason: logistics?.remaining
        ? `今日仍有 ${logistics.remaining} 点物流容量可分配。`
        : "核对订单缺口，为下一次物流恢复提前备货。",
      panel: "operations",
      targetId: "homestead-orders",
    },
    {
      id: "prepare-growth",
      title: "规划下一项研究",
      reason: "将研究点投入当前最明显的三业瓶颈。",
      panel: "growth",
      targetId: "homestead-research",
    },
    ...(activeTownId === "frostpeak"
      ? [{
          id: "frostpeak-local-chain",
          title: "推进霜岭本地协作",
          reason: "核对本地物资、民生问题和热力站修复进度。",
          panel: "operations" as const,
          targetId: "homestead-town-local" as const,
        }]
      : []),
  ];

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
        planCandidates,
        pacingCandidates,
        playerIntent: {
          goal: homestead.aiProfile?.goal ?? "balanced",
          risk: homestead.aiProfile?.risk ?? "balanced",
          focus: homestead.aiProfile?.focus ?? "processing",
        },
      },
      candidates: eventCandidates,
    },
    fallback: fixedEvent,
  };
}

const SYSTEM_PROMPT = [
  "你是多城镇三业庄园的每日叙事导演。",
  "服务器已经提供了合法事件模板候选，并决定了真实天气、灾害、数值倍率、价格、成本和奖励；你只能选择候选索引，不得改写或新增规则。",
  "若只有一个事件候选，i 必须为 0；若有多个候选，根据当前城镇状态选择最相关的一项。",
  "你可以依据当前城镇、农场、牧场、矿山、天气与灾害、物流容量、玩家目标、经济瓶颈和最近操作，生成展示用叙事与经营建议。",
  "商店建议只能填写 shopOptions 中的索引 s；它只是展示建议，不会自动购买或生效。",
  "不得编造物品、NPC、城镇、灾害、奖励、成本、价格、倍率或产量数字。",
  "从 planOptions 中选择三个不同索引，按执行顺序写入 p；这些索引只用于跳转到服务器已有功能。",
  "只返回 JSON：{\"i\":0,\"t\":\"短标题\",\"n\":\"不超过120字的叙事\",\"a\":\"不超过80字的经营建议\",\"l\":\"不超过50字的NPC台词\",\"p\":[0,2,4],\"s\":0}。i 必须来自 eventOptions；没有合适商店建议时省略 s。",
  " Set v to an index from pacingOptions. Never emit a raw duration, reward, cost, price, multiplier, or quantity.",
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
      event: "server_whitelisted_templates",
      weather: "server_fixed",
      disaster: "server_fixed",
      economy: "server_fixed",
      llmOutput: "server_whitelist_indices_and_presentation",
    },
    state: input.state,
    eventOptions: input.candidates.map((candidate, index) => ({
      i: index,
      id: candidate.eventId,
      title: candidate.title,
      tone: candidate.tone,
    })),
    pacingOptions: input.state.pacingCandidates.map((candidate, index) => ({
      v: index,
      ...candidate,
    })),
    shopOptions: input.state.merchantCandidates.map((candidate, index) => ({
      s: index,
      ...candidate,
    })),
    planOptions: input.state.planCandidates.map((candidate, index) => ({
      p: index,
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
  planCandidateCount: number,
  pacingCandidateIds: readonly HomesteadGeneratedEventPacingId[],
  eventCandidateCount: number,
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
      p?: unknown;
      s?: unknown;
      v?: unknown;
    };
    if (
      !Number.isSafeInteger(value.i) ||
      Number(value.i) < 0 ||
      Number(value.i) >= eventCandidateCount
    ) {
      return { index: null, reason: "invalid_candidate" };
    }
    const rawPacingIndex = value.v === undefined ? 0 : value.v;
    if (
      !Number.isSafeInteger(rawPacingIndex) ||
      Number(rawPacingIndex) < 0 ||
      Number(rawPacingIndex) >= pacingCandidateIds.length
    ) {
      return { index: null, reason: "invalid_candidate" };
    }
    const eventPacingId = pacingCandidateIds[Number(rawPacingIndex)]!;

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
    const rawPlanStepIndices = value.p === undefined
      ? [0, 1, 2]
      : value.p;
    if (
      !Array.isArray(rawPlanStepIndices) ||
      rawPlanStepIndices.length !== 3 ||
      rawPlanStepIndices.some(
        (index) =>
          !Number.isSafeInteger(index) ||
          Number(index) < 0 ||
          Number(index) >= planCandidateCount,
      ) ||
      new Set(rawPlanStepIndices).size !== rawPlanStepIndices.length
    ) {
      return { index: null, reason: "invalid_candidate" };
    }
    return {
      index: Number(value.i),
      presentation: {
        title: safeText(value.t, 60),
        narrative: safeText(value.n, 160),
        recommendation: safeText(value.a, 100),
        npcLine: safeText(value.l, 80),
        planStepIndices: rawPlanStepIndices.map(Number),
        eventPacingId,
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
    const pacingCandidateIds = input.state.pacingCandidates
      .map(({ id }) => id);
    let failureReason: BotDecisionFailureReason = "invalid_json";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = attempt === 0
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT} 上一次输出无效，请只输出一个 JSON 对象，且 i 必须为 0。`;
      const payload = await this.request(instruction, prompt);
      const completion = responseText(payload) ?? "";
      usage.promptTokens += estimateTokens(`${instruction}\n${prompt}`);
      usage.completionTokens += estimateTokens(completion);
      const parsed = parseCandidate(
        completion,
        merchantCandidateIds,
        input.state.planCandidates.length,
        pacingCandidateIds,
        input.candidates.length,
      );
      if (parsed.index !== null) {
        return {
          candidateIndex: parsed.index,
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
