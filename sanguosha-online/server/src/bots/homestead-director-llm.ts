import {
  ESTATE_MERCHANT_ITEM_IDS,
  ESTATE_MERCHANT_ITEMS,
  HOMESTEAD_NPCS,
  HOMESTEAD_RESEARCH,
  HOMESTEAD_WEATHER,
  HOMESTEAD_WORLD_EVENTS,
  getHomesteadProductionRules,
  getHomesteadResearchRequirementProgress,
  getTownDefinition,
  researchIdsForTown,
  townRhythmDefinition,
  type EstateMerchantItemId,
  type FarmingGameState,
  type HomesteadAdviceStep,
  type HomesteadGameState,
  type HomesteadGeneratedEventPacingId,
  type HomesteadNpcId,
  type HomesteadResource,
  type HomesteadWorldBeatId,
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
  readonly purchasedToday?: number;
  /** @deprecated Legacy test/caller alias. */
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

export interface HomesteadDirectorBeatCandidate {
  readonly id: HomesteadWorldBeatId;
  readonly label: string;
  readonly intent: string;
}

export interface HomesteadDirectorEvidenceFact {
  readonly id: string;
  readonly label: string;
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
  readonly townProgress?: readonly {
    readonly townId: string;
    readonly townName: string;
    readonly active: boolean;
    readonly unlocked: boolean;
    readonly localReputation: number;
    readonly farmLevel: number;
    readonly ranchLevel: number;
    readonly mineLevel: number;
    readonly landmarkStage: number;
  }[];
  readonly shipments?: readonly {
    readonly cargoName: string;
    readonly fromTown: string;
    readonly toTown: string;
    readonly status: "in_transit" | "ready" | "collected";
    readonly secondsRemaining: number;
    readonly canCollect: boolean;
  }[];
  readonly cargoRoutes?: readonly {
    readonly cargoName: string;
    readonly fromTown: string;
    readonly toTown: string;
    readonly canDispatch: boolean;
    readonly disabledReason: string | null;
    readonly missingResources: readonly string[];
  }[];
  readonly valueRouteDeficits?: readonly string[];
}

interface CompactMerchantCandidate {
  readonly itemId: EstateMerchantItemId;
  readonly name: string;
  readonly category: string;
  readonly coinPrice: number;
  readonly owned: number | null;
  readonly purchasedToday: number | null;
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
  readonly honorScore: number;
  readonly npcTrust: readonly string[];
  readonly advisorMemories: readonly {
    readonly advisorId: string;
    readonly advisorName: string;
    readonly trust: number;
    readonly facts: readonly string[];
  }[];
  readonly activeGuidance: readonly string[];
  readonly infrastructure: readonly string[];
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
  readonly forecast: readonly {
    readonly day: string;
    readonly condition: string;
    readonly temperatureMinC: number;
    readonly temperatureMaxC: number;
    readonly precipitationProbabilityPercent: number;
  }[];
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
    readonly marketBuyPercent: number;
    readonly marketSellPercent: number;
  }[];
  readonly activeDecisionEffect: string | null;
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
  readonly townProgress: NonNullable<HomesteadDirectorContext["townProgress"]>;
  readonly shipments: NonNullable<HomesteadDirectorContext["shipments"]>;
  readonly cargoRoutes: NonNullable<HomesteadDirectorContext["cargoRoutes"]>;
  readonly cargoInventory: readonly string[];
  readonly valueRouteDeficits: readonly string[];
  readonly townRhythm: {
    readonly name: string;
    readonly progress: number;
    readonly completedCycles: number;
    readonly nextStep: string | null;
    readonly nextSector: "farm" | "ranch" | "mine" | null;
    readonly blockedToday: boolean;
  };
  readonly researchFrontier: readonly {
    readonly id: string;
    readonly name: string;
    readonly cost: number;
    readonly requiredReputation: number;
    readonly missingPrerequisites: readonly string[];
    readonly milestones: readonly string[];
  }[];
  readonly evidenceFacts: readonly HomesteadDirectorEvidenceFact[];
  readonly directorBeatCandidates: readonly HomesteadDirectorBeatCandidate[];
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

const HOMESTEAD_DIRECTOR_BEATS: readonly HomesteadDirectorBeatCandidate[] = [
  { id: "recovery", label: "恢复", intent: "修复风险、库存或生产状态，让世界从压力中恢复。" },
  { id: "pressure", label: "压力", intent: "把已存在的灾害、短缺或期限推到舞台中央。" },
  { id: "opportunity", label: "机遇", intent: "让可执行项目、富余资源或天气窗口成为今日机会。" },
  { id: "community", label: "共同体", intent: "延续顾问信任、城镇记忆和居民协作。" },
  { id: "discovery", label: "发现", intent: "突出研究前沿、矿层、图鉴或新经营知识。" },
  { id: "trade", label: "商路", intent: "突出订单、物流、跨城货运和特色资源互补。" },
];

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function eventRelevanceScore(
  candidate: (typeof HOMESTEAD_WORLD_EVENTS)[HomesteadWorldEventId],
  homestead: HomesteadGameState,
): number {
  const text = `${candidate.id} ${candidate.title} ${candidate.summary}`.toLowerCase();
  const focus = homestead.aiProfile?.focus ?? "processing";
  const focusKeywords: Record<typeof focus, readonly string[]> = {
    farm: ["farm", "crop", "soil", "田", "作物", "灌溉", "供水"],
    ranch: ["ranch", "herd", "animal", "牧", "牲畜", "饲料"],
    mine: ["mine", "ore", "geology", "矿", "地层", "采掘"],
    processing: ["market", "trade", "order", "加工", "商", "订单", "物流"],
  };
  let score = focusKeywords[focus].some((keyword) => text.includes(keyword))
    ? 12
    : 0;
  const risk = homestead.aiProfile?.risk ?? "balanced";
  if (risk === "safe" && candidate.tone === "calm") score += 8;
  if (risk === "balanced" && candidate.tone === "opportunity") score += 6;
  if (risk === "bold" && candidate.tone !== "calm") score += 8;
  const goal = homestead.aiProfile?.goal ?? "balanced";
  if (goal === "wealth" && /trade|market|商|订单|物流/.test(text)) score += 8;
  if (goal === "reputation" && /community|居民|顾问|协作/.test(text)) score += 8;
  if (goal === "research" && /research|地层|研究|发现|遗迹/.test(text)) score += 8;
  return score + (stableHash(`${homestead.dayKey}:${candidate.id}`) % 7);
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
    if (resource.source === "mine") {
      return mine.ores[resource.itemId] ?? 0;
    }
    return homestead.cargoInventory[resource.itemId] ?? 0;
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
      purchasedToday: Number.isSafeInteger(
          candidate.purchasedToday ?? candidate.purchasedThisWeek,
        )
        ? Math.max(
            0,
            candidate.purchasedToday ?? candidate.purchasedThisWeek ?? 0,
          )
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
    homestead.disaster ||
      eventDefinition.hazard ||
      homestead.worldEvent.source === "llm" ||
      homestead.worldEvent.selectedOptionId !== null
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
            .sort(
              (left, right) =>
                eventRelevanceScore(right, homestead) -
                eventRelevanceScore(left, homestead),
            )
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
  const hasReadyShipment = context?.shipments?.some(
    ({ status, canCollect }) => status === "ready" && canCollect,
  ) ?? false;
  const hasDispatchableCargo = context?.cargoRoutes?.some(
    ({ canDispatch }) => canDispatch,
  ) ?? false;
  const crossTownUnlocked = (context?.townProgress ?? [])
    .filter(({ unlocked }) => unlocked).length >= 2;
  const rhythmDefinition = townRhythmDefinition(activeTownId);
  const rhythmProgress = homestead.townRhythm?.dayKey === homestead.dayKey
    ? homestead.townRhythm.progress
    : 0;
  const nextRhythmStep = rhythmProgress >= 3
    ? null
    : rhythmDefinition.steps[rhythmProgress as 0 | 1 | 2];
  const rhythmBlockedToday = rhythmProgress >= 3
    ? false
    : rhythmDefinition.steps
      .slice(rhythmProgress)
      .some(
        (step) =>
          homestead.specializations[step.sectorId].lastManagedDayKey ===
          homestead.dayKey,
      );
  const unlockedResearch = new Set(homestead.research.unlocked);
  const researchFrontier = researchIdsForTown(activeTownId)
    .filter((nodeId) => !unlockedResearch.has(nodeId))
    .map((nodeId) => {
      const definition = HOMESTEAD_RESEARCH[nodeId];
      const missingPrerequisites = definition.prerequisites
        .filter((requiredId) => !unlockedResearch.has(requiredId))
        .map((requiredId) => HOMESTEAD_RESEARCH[requiredId].name);
      const milestones = getHomesteadResearchRequirementProgress(
        homestead,
        definition,
      ).map(({ label, current, required, satisfied }) =>
        `${satisfied ? "已达成" : "未达成"}:${label} ${current}/${required}`
      );
      return {
        id: definition.id,
        name: definition.name,
        cost: definition.researchCost,
        requiredReputation: definition.requiredReputation,
        missingPrerequisites,
        milestones,
      };
    })
    .sort((left, right) =>
      left.missingPrerequisites.length - right.missingPrerequisites.length ||
      left.cost - right.cost
    )
    .slice(0, 6);
  const stateBottlenecks = economicBottlenecks({
    farmStock,
    ranchStock,
    mineStock,
    production,
    logistics: context?.logistics,
    disasterActive: homestead.disaster !== null,
    supplied: context?.economicBottlenecks,
  });
  const evidenceFacts: HomesteadDirectorEvidenceFact[] = [
    {
      id: "weather",
      label: `${townDefinition.name}当前天气：${compactText(
        homestead.weather.conditionText ??
          HOMESTEAD_WEATHER[homestead.weather.weatherId].name,
        48,
      )}；来源 ${homestead.weather.source ?? "rules"}`,
    },
    {
      id: "sector-health",
      label: `土壤健康 ${homestead.specializations.farm.soilHealth}，牧群健康 ${homestead.specializations.ranch.herdHealth}，矿山防护 ${homestead.specializations.mine.protectionLevel}`,
    },
    {
      id: "stocks",
      label: `三业基础库存：农场 ${farmStock}、牧场 ${ranchStock}、矿山 ${mineStock}`,
    },
    {
      id: "town-rhythm",
      label: `${rhythmDefinition.name} ${rhythmProgress}/3；下一步${
        nextRhythmStep ? `“${nextRhythmStep.name}”` : "已完成"
      }${rhythmBlockedToday ? "，今日已因顺序错误无法完成完整循环" : ""}`,
    },
  ];
  if (logistics) {
    evidenceFacts.push({
      id: "logistics",
      label: `物流容量 ${logistics.used}/${logistics.capacity}，剩余 ${logistics.remaining}`,
    });
  }
  if (homestead.disaster) {
    evidenceFacts.push({
      id: "disaster",
      label: `持续灾害 ${homestead.disaster.eventId}，强度 ${homestead.disaster.severity}，剩余 ${homestead.disaster.remainingDays} 日，${homestead.disaster.mitigated ? "已处置" : "未处置"}`,
    });
  }
  if (researchFrontier[0]) {
    evidenceFacts.push({
      id: "research-frontier",
      label: `研究前沿“${researchFrontier[0].name}”：研究点 ${homestead.researchPoints}/${researchFrontier[0].cost}，声望 ${homestead.reputation}/${researchFrontier[0].requiredReputation}`,
    });
  }
  const readyShipment = context?.shipments?.find(
    ({ status, canCollect }) => status === "ready" && canCollect,
  );
  if (readyShipment) {
    evidenceFacts.push({
      id: "ready-shipment",
      label: `${readyShipment.cargoName}已从${readyShipment.fromTown}抵达${readyShipment.toTown}，可以领取`,
    });
  }
  if (stateBottlenecks[0]) {
    evidenceFacts.push({
      id: "bottleneck",
      label: stateBottlenecks[0],
    });
  }
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
    ...(
      crossTownUnlocked ||
        (context?.shipments?.length ?? 0) > 0
        ? [{
            id: "review-intertown-logistics",
            title: hasReadyShipment
              ? "领取跨城到货"
              : hasDispatchableCargo
                ? "安排跨城发货"
                : "补齐跨城装箱物资",
            reason: hasReadyShipment
              ? "已有货物抵达当前目的地，领取后可推进当地联动项目。"
              : hasDispatchableCargo
                ? "当前库存和物流容量允许发出一批特色物资。"
                : "核对装箱缺口与在途批次，避免两镇继续各自循环。",
            panel: "operations" as const,
            targetId: "homestead-town-trade" as const,
          }]
        : []
    ),
    {
      id: "advance-town-rhythm",
      title: nextRhythmStep
        ? `推进${rhythmDefinition.name}：${nextRhythmStep.name}`
        : `${rhythmDefinition.name}已完成`,
      reason: rhythmBlockedToday
        ? "今日经营顺序已经错过，保留现有收益并按正确顺序规划明日。"
        : nextRhythmStep
          ? `${rhythmDefinition.summary} 当前需要先进行${nextRhythmStep.name}。`
          : "本日三业闭环已经完成，可利用已生效的本地协同增益。",
      panel: "operations",
      targetId: "homestead-town-rhythm",
    },
    {
      id: "prepare-growth",
      title: "规划下一项研究",
      reason: researchFrontier[0]
        ? `下一批研究“${researchFrontier[0].name}”还需同时满足点数、声望与经营里程碑。`
        : "本镇研究已经完成，转向荣誉、图鉴和跨城经营。",
      panel: "growth",
      targetId: "homestead-research",
    },
    {
      id: "develop-town-infrastructure",
      title: "建设城镇基础设施",
      reason: "共通设施支撑三业周转，特色设施决定本镇产业优势与高级跨城合同。",
      panel: "operations" as const,
      targetId: "homestead-town-local" as const,
    },
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
        honorScore: homestead.honor?.score ?? 0,
        npcTrust: homestead.npcs.map(
          ({ npcId, trust }) =>
            `${HOMESTEAD_NPCS[npcId].name}(${npcId}):${trust}`,
        ),
        advisorMemories: homestead.npcs.map(({ npcId, trust, facts }) => ({
          advisorId: npcId,
          advisorName: HOMESTEAD_NPCS[npcId].name,
          trust,
          facts: facts.slice(0, 8).map(({ key, value }) =>
            compactText(`${key}=${value}`, 96)
          ),
        })),
        activeGuidance: Object.values(homestead.advisorGuidance ?? {})
          .filter((guidance) => guidance?.dayKey === homestead.dayKey)
          .map((guidance) => compactText(
            `${guidance!.sectorId}:${guidance!.label}，产量${guidance!.yieldPercent}%/工期${guidance!.durationPercent}%`,
            120,
          )),
        infrastructure: Object.entries(homestead.infrastructure ?? {})
          .filter(([, level]) => level > 0)
          .map(([id, level]) => `${id}:LV${level}`),
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
        forecast: homestead.resilience.weather_station >= 1 &&
            homestead.weather.source === "live" &&
            homestead.weather.stale !== true
          ? (homestead.weather.forecast ?? [])
            .slice(0, 3)
            .map((day) => ({
              day: new Date(day.forecastStartAt).toISOString().slice(0, 10),
              condition: compactText(day.conditionText, 48),
              temperatureMinC: day.temperatureMinC,
              temperatureMaxC: day.temperatureMaxC,
              precipitationProbabilityPercent:
                day.precipitationProbabilityPercent,
            }))
          : [],
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
            marketBuyPercent: production.farm.marketBuyPercent ?? 0,
            marketSellPercent: production.farm.marketSellPercent ?? 0,
          },
          {
            sector: "ranch",
            yieldPercent: production.ranch.yieldPercent,
            durationPercent: production.ranch.durationPercent,
            marketBuyPercent: production.ranch.marketBuyPercent ?? 0,
            marketSellPercent: production.ranch.marketSellPercent ?? 0,
          },
          {
            sector: "mine",
            yieldPercent: production.mine.yieldPercent,
            durationPercent: production.mine.durationPercent,
            marketBuyPercent: production.mine.marketBuyPercent ?? 0,
            marketSellPercent: production.mine.marketSellPercent ?? 0,
          },
        ],
        activeDecisionEffect:
          homestead.decisionEffect?.dayKey === homestead.dayKey
            ? compactText(homestead.decisionEffect.effect.label, 120)
            : null,
        resilience: Object.entries(homestead.resilience)
          .map(([id, level]) => `${id}:${level}`),
        logistics,
        merchantCandidates: shopCandidates,
        economicBottlenecks: stateBottlenecks,
        townResources: activeTown
          ? Object.entries(activeTown.inventory)
            .map(([id, quantity]) => `${id}:${quantity}`)
            .slice(0, 24)
          : [],
        townLandmarkStage: activeTown?.landmarkStage ?? 0,
        townProgress: (context?.townProgress ?? []).slice(0, 4),
        shipments: (context?.shipments ?? []).slice(0, 8),
        cargoRoutes: (context?.cargoRoutes ?? []).slice(0, 4),
        cargoInventory: Object.entries(homestead.cargoInventory)
          .filter(([, quantity]) => quantity > 0)
          .map(([cargoId, quantity]) => `${cargoId}:${quantity}`),
        valueRouteDeficits: (context?.valueRouteDeficits ?? [])
          .map((item) => compactText(item, 120))
          .filter(Boolean)
          .slice(0, 8),
        townRhythm: {
          name: rhythmDefinition.name,
          progress: rhythmProgress,
          completedCycles: homestead.townRhythm?.completedCycles ?? 0,
          nextStep: nextRhythmStep?.name ?? null,
          nextSector: nextRhythmStep?.sectorId ?? null,
          blockedToday: rhythmBlockedToday,
        },
        researchFrontier,
        evidenceFacts: evidenceFacts.slice(0, 10),
        directorBeatCandidates: HOMESTEAD_DIRECTOR_BEATS,
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
  "你是多城镇三业庄园的世界导演，不是自动经营员。你的职责是让天气、事件、城镇个性、三业循环、顾问记忆、研究成长与跨城商路形成有因果、有延续的每日世界节拍，同时把最终选择留给玩家。",
  "服务器已经提供合法事件、剧情节拍、顾问、事实依据、节奏、行动和商店候选，并决定真实天气、灾害、数值倍率、价格、成本和奖励；你只能选择候选索引，不得改写或新增规则。",
  "若只有一个事件候选，i 必须为 0；若有多个候选，根据当前城镇状态选择最相关的一项。",
  "先从 directorBeatOptions 选择 b，决定今日是恢复、压力、机遇、共同体、发现还是商路节拍；再从 advisorOptions 选择与叙事一致的本地顾问 d。NPC 台词必须符合该顾问的职责与已提供记忆。",
  "从 evidenceOptions 选择 1 至 3 个互不重复的事实索引 e。叙事和建议必须由这些事实支撑，并优先处理：未处置灾害、可领取到货、会影响排产的预报、城镇经营节奏、研究里程碑、可执行跨城发货或可完成项目。",
  "f 是不超过 60 字的跨日伏笔，只能表达可能延续的压力或机会，不得承诺明日一定发生，也不得把尚未执行的操作写成已完成。未来预报只用于规划，不能当作已生效倍率。",
  "商店建议只能填写 shopOptions 中的索引 s；它只是展示建议，不会自动购买或生效。",
  "不得编造物品、NPC、城镇、灾害、奖励、成本、价格、倍率或产量数字。",
  "从 planOptions 中选择三个不同索引，按执行顺序写入 p；这些索引只用于跳转到服务器已有功能。",
  "只返回 JSON：{\"i\":0,\"v\":0,\"b\":0,\"d\":0,\"e\":[0,2],\"t\":\"短标题\",\"n\":\"不超过120字的叙事\",\"a\":\"不超过80字的经营建议\",\"l\":\"不超过50字的NPC台词\",\"f\":\"不超过60字的伏笔\",\"p\":[0,2,4],\"s\":0}。i 必须来自 eventOptions；没有合适商店建议时省略 s。",
  " Set v to an index from pacingOptions. Never emit a raw duration, reward, cost, price, multiplier, or quantity.",
].join("");

function compactPrompt(
  input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >,
): string {
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
    directorBeatOptions: input.state.directorBeatCandidates.map(
      (candidate, index) => ({ b: index, ...candidate }),
    ),
    advisorOptions: input.state.advisorMemories.map((candidate, index) => ({
      d: index,
      ...candidate,
    })),
    evidenceOptions: input.state.evidenceFacts.map((candidate, index) => ({
      e: index,
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

function responseUsage(payload: unknown): {
  readonly promptTokens: number;
  readonly completionTokens: number;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as {
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  }).usage;
  if (
    !Number.isFinite(usage?.prompt_tokens) ||
    !Number.isFinite(usage?.completion_tokens)
  ) {
    return null;
  }
  return {
    promptTokens: Math.max(0, Math.round(Number(usage!.prompt_tokens))),
    completionTokens: Math.max(
      0,
      Math.round(Number(usage!.completion_tokens)),
    ),
  };
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function parseCandidate(
  completion: string,
  merchantCandidateIds: readonly EstateMerchantItemId[],
  planCandidateCount: number,
  pacingCandidateIds: readonly HomesteadGeneratedEventPacingId[],
  directorBeatIds: readonly HomesteadWorldBeatId[],
  advisorCandidateCount: number,
  evidenceCandidateCount: number,
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
      b?: unknown;
      d?: unknown;
      e?: unknown;
      f?: unknown;
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
    const rawBeatIndex = value.b === undefined ? 0 : value.b;
    if (
      !Number.isSafeInteger(rawBeatIndex) ||
      Number(rawBeatIndex) < 0 ||
      Number(rawBeatIndex) >= directorBeatIds.length
    ) {
      return { index: null, reason: "invalid_candidate" };
    }
    const rawAdvisorIndex = value.d === undefined ? 0 : value.d;
    if (
      !Number.isSafeInteger(rawAdvisorIndex) ||
      Number(rawAdvisorIndex) < 0 ||
      Number(rawAdvisorIndex) >= advisorCandidateCount
    ) {
      return { index: null, reason: "invalid_candidate" };
    }
    const rawEvidenceIndices = value.e === undefined ? [0] : value.e;
    if (
      !Array.isArray(rawEvidenceIndices) ||
      rawEvidenceIndices.length < 1 ||
      rawEvidenceIndices.length > 3 ||
      rawEvidenceIndices.some(
        (index) =>
          !Number.isSafeInteger(index) ||
          Number(index) < 0 ||
          Number(index) >= evidenceCandidateCount,
      ) ||
      new Set(rawEvidenceIndices).size !== rawEvidenceIndices.length
    ) {
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
        advisorIndex: Number(rawAdvisorIndex),
        directorBeatId: directorBeatIds[Number(rawBeatIndex)],
        evidenceIndices: rawEvidenceIndices.map(Number),
        foreshadowing: safeText(value.f, 120),
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
    const directorBeatIds = input.state.directorBeatCandidates
      .map(({ id }) => id);
    let failureReason: BotDecisionFailureReason = "invalid_json";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = attempt === 0
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT} 上一次输出无效，请只输出一个 JSON 对象；所有索引必须落在对应 Options 的实际范围内。`;
      const payload = await this.request(instruction, prompt);
      const completion = responseText(payload) ?? "";
      const reportedUsage = responseUsage(payload);
      usage.promptTokens += reportedUsage?.promptTokens ??
        estimateTokens(`${instruction}\n${prompt}`);
      usage.completionTokens += reportedUsage?.completionTokens ??
        estimateTokens(completion);
      const parsed = parseCandidate(
        completion,
        merchantCandidateIds,
        input.state.planCandidates.length,
        pacingCandidateIds,
        directorBeatIds,
        input.state.advisorMemories.length,
        input.state.evidenceFacts.length,
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
