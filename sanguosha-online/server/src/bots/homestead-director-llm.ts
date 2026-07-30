import {
  HOMESTEAD_WEATHER,
  HOMESTEAD_WORLD_EVENTS,
  getHomesteadProductionRules,
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

export interface HomesteadDirectorCompactState {
  readonly day: string;
  readonly farmLevel: number;
  readonly ranchLevel: number;
  readonly mineLevel: number;
  readonly coins: number;
  readonly reputation: number;
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
  readonly weather: string;
  readonly disaster: string | null;
  readonly productionEffects: readonly string[];
  readonly resilience: readonly string[];
  readonly activeTown: string;
  readonly localReputation: number;
  readonly merchantRenown: number;
  readonly townResources: readonly string[];
  readonly townProblem: string | null;
  readonly townLandmarkStage: number;
}

export interface HomesteadDirectorRequest {
  readonly input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >;
  readonly fallback: HomesteadDirectorCandidate;
}

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

export function createHomesteadDirectorDecision(
  homestead: HomesteadGameState,
  farm: FarmingGameState,
  ranch: RanchGameState,
  mine: MineGameState,
  playerId: string,
): HomesteadDirectorRequest | null {
  if (
    homestead.ownerId !== playerId ||
    farm.ownerId !== playerId ||
    ranch.ownerId !== playerId ||
    mine.ownerId !== playerId
  ) {
    return null;
  }
  const candidateIds: readonly HomesteadWorldEventId[] = homestead.disaster
    ? [homestead.disaster.eventId]
    : ["steady_weather", "harvest_festival"];
  const candidates = candidateIds.map((eventId) => {
    const event = HOMESTEAD_WORLD_EVENTS[eventId];
    return { eventId, title: event.title, tone: event.tone };
  });
  const fallback = candidates.find(
    ({ eventId }) => eventId === homestead.worldEvent.eventId,
  ) ?? candidates[0]!;
  const production = getHomesteadProductionRules(homestead);
  const activeTownId = homestead.townNetwork?.activeTownId ?? "greenvale";
  const activeTown = homestead.townNetwork?.towns[activeTownId];
  const frostTown = homestead.townNetwork?.towns.frostpeak;
  const townProblem = activeTownId === "frostpeak"
    ? ["blocked_supply_road", "frozen_waterworks", "avalanche_mine"].find(
      (id) => !frostTown?.resolvedProblemIds.includes(id),
    ) ?? null
    : null;
  return {
    input: {
      roomId: "persistent-homestead",
      playerId,
      intelligence: 7,
      state: {
        day: homestead.dayKey,
        farmLevel: farm.level,
        ranchLevel: ranch.level,
        mineLevel: mine.level,
        coins: farm.coins,
        reputation: homestead.reputation,
        researchPoints: homestead.researchPoints,
        builtFacilities: homestead.facilities
          .filter(({ built }) => built)
          .map(({ id }) => id),
        farmStock: total(farm.produce),
        ranchStock: total(ranch.products),
        mineStock: total(mine.ores),
        soilHealth: homestead.specializations.farm.soilHealth,
        herdHealth: homestead.specializations.ranch.herdHealth,
        mineProtection: homestead.specializations.mine.protectionLevel,
        seasonScore: homestead.season.score,
        npcTrust: homestead.npcs.map(
          ({ npcId, trust }) => `${npcId}:${trust}`,
        ),
        recentOperations: homestead.logs
          .slice(0, 6)
          .map(({ message }) => message.replaceAll(homestead.ownerName, "庄主")),
        weather: HOMESTEAD_WEATHER[homestead.weather.weatherId].name,
        disaster: homestead.disaster
          ? `${homestead.disaster.eventId}:severity-${homestead.disaster.severity}:resolved-${homestead.disaster.mitigated}`
          : null,
        productionEffects: [
          `farm:${production.farm.yieldPercent}/${production.farm.durationPercent}`,
          `ranch:${production.ranch.yieldPercent}/${production.ranch.durationPercent}`,
          `mine:${production.mine.yieldPercent}/${production.mine.durationPercent}`,
        ],
        resilience: Object.entries(homestead.resilience)
          .map(([id, level]) => `${id}:${level}`),
        activeTown: activeTownId,
        localReputation: activeTownId === "greenvale"
          ? homestead.reputation
          : activeTown?.reputation ?? 0,
        merchantRenown: homestead.townNetwork?.merchantRenown ?? 0,
        townResources: activeTownId === "frostpeak" && activeTown
          ? Object.entries(activeTown.inventory)
            .map(([id, quantity]) => `${id}:${quantity}`)
          : [],
        townProblem,
        townLandmarkStage: activeTown?.landmarkStage ?? 0,
      },
      candidates,
    },
    fallback,
  };
}

const SYSTEM_PROMPT =
  "你是多城镇三业庄园的每日世界导演。农场、牧场和矿山必须被同等考虑；叙事和建议应结合当前城镇、当地声望、待解决问题、地标阶段与本地库存。根据结构化状态和最近操作，从给定候选事件中选择最能产生跨产业取舍的一项。不得编造事件、奖励、成本、物品或任何数值；LLM只负责选择和表达，服务器负责全部规则结算。只返回 JSON：{\"i\":0,\"t\":\"短标题\",\"n\":\"不超过120字的叙事\",\"a\":\"不超过80字且不含数值的经营建议\",\"l\":\"不超过50字的NPC台词\"}。";

function compactPrompt(
  input: BotDecisionInput<
    HomesteadDirectorCompactState,
    HomesteadDirectorCandidate
  >,
): string {
  return JSON.stringify({
    ...input.state,
    options: input.candidates.map((candidate, index) => ({
      i: index,
      id: candidate.eventId,
      title: candidate.title,
      tone: candidate.tone,
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
  candidateCount: number,
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
    };
    if (!Number.isSafeInteger(value.i)) {
      return { index: null, reason: "invalid_candidate" };
    }
    const index = Number(value.i);
    const safeText = (candidate: unknown, limit: number): string | undefined => {
      if (typeof candidate !== "string") return undefined;
      const text = candidate.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      return text ? text.slice(0, limit) : undefined;
    };
    return index >= 0 && index < candidateCount
      ? {
          index,
          presentation: {
            title: safeText(value.t, 60),
            narrative: safeText(value.n, 160),
            recommendation: safeText(value.a, 100),
            npcLine: safeText(value.l, 80),
          },
        }
      : { index: null, reason: "invalid_candidate" };
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
    const prompt = compactPrompt(input);
    const usage = { promptTokens: 0, completionTokens: 0 };
    let failureReason: BotDecisionFailureReason = "invalid_json";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = attempt === 0
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT} 上一次输出无效，请只输出一个 JSON 对象。`;
      const payload = await this.request(instruction, prompt);
      const completion = responseText(payload) ?? "";
      usage.promptTokens += estimateTokens(`${instruction}\n${prompt}`);
      usage.completionTokens += estimateTokens(completion);
      const parsed = parseCandidate(completion, input.candidates.length);
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
