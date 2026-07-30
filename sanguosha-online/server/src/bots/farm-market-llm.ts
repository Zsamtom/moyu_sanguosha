import {
  getFarmingCropDefinition,
  type FarmingCropId,
  type FarmingGameState,
  type FarmingMarketDecision,
} from "@sanguosha/shared";
import type {
  BotDecisionFailureReason,
  BotDecisionInput,
  BotDecisionProvider,
  BotDecisionResult,
} from "./decision-registry.js";
import { BotDecisionProviderError } from "./decision-registry.js";
import type { OpenAiCompatibleDoudizhuConfig } from "./doudizhu-llm.js";

export interface FarmMarketCompactState {
  readonly day: string;
  readonly level: number;
  readonly coins: number;
  readonly seeds: Partial<Record<FarmingCropId, number>>;
  readonly produce: Partial<Record<FarmingCropId, number>>;
  readonly planted: Partial<Record<FarmingCropId, number>>;
  readonly prices: Partial<Record<FarmingCropId, number>>;
  readonly trends: Partial<Record<FarmingCropId, -1 | 0 | 1>>;
  readonly recentOperations: readonly string[];
}

export interface FarmMarketDecisionRequest {
  readonly input: BotDecisionInput<FarmMarketCompactState, FarmingMarketDecision>;
  readonly fallback: FarmingMarketDecision;
}

function clampPrice(cropId: FarmingCropId, value: number): number {
  const crop = getFarmingCropDefinition(cropId);
  return Math.max(crop.minimumPrice, Math.min(crop.maximumPrice, Math.round(value)));
}

function priceMap(
  state: FarmingGameState,
  changes: Partial<Record<FarmingCropId, number>> = {},
): Record<FarmingCropId, number> {
  const cropIds = Object.keys(state.market) as FarmingCropId[];
  return Object.fromEntries(cropIds.map((cropId) => [
    cropId,
    clampPrice(cropId, changes[cropId] ?? state.market[cropId].price),
  ])) as Record<FarmingCropId, number>;
}

function scenario(
  state: FarmingGameState,
  title: string,
  summary: string,
  tone: FarmingMarketDecision["tone"],
  changes?: Partial<Record<FarmingCropId, number>>,
): FarmingMarketDecision {
  return { title, summary, tone, prices: priceMap(state, changes) };
}

export function createFarmMarketDecision(
  game: FarmingGameState,
  playerId: string,
): FarmMarketDecisionRequest | null {
  if (game.ownerId !== playerId) return null;

  const baseline = scenario(
    game,
    "常规供需",
    "今日批发市场供需平稳，沿用规则市场生成的基准报价。",
    "neutral",
  );
  const candidates: FarmingMarketDecision[] = [
    baseline,
    scenario(
      game,
      "合作社采购观察",
      "合作社正在观察本镇库存结构；本轮价格仍完全沿用规则引擎报价。",
      "surge",
    ),
    scenario(
      game,
      "鲜食渠道简报",
      "餐饮渠道发布了需求简报；LLM只解释机会，不改动任何作物价格。",
      "neutral",
    ),
    scenario(
      game,
      "跨镇物流提示",
      "交通与天气可能改变经营重点，但本轮结算价格已经由规则系统冻结。",
      "volatile",
    ),
  ];
  const cropIds = Object.keys(game.market) as FarmingCropId[];
  const planted = Object.fromEntries(cropIds.map((cropId) => [
    cropId,
    game.plots.filter((plot) => plot.cropId === cropId).length,
  ])) as Record<FarmingCropId, number>;
  const state: FarmMarketCompactState = {
    day: game.marketDay,
    level: game.level,
    coins: game.coins,
    seeds: { ...game.seeds },
    produce: { ...game.produce },
    planted,
    prices: priceMap(game),
    trends: Object.fromEntries(cropIds.map((cropId) => [
      cropId,
      game.market[cropId].trend,
    ])) as Record<FarmingCropId, -1 | 0 | 1>,
    recentOperations: game.logs
      .slice(-6)
      .map((entry) => entry.text.replaceAll(game.ownerName, "经营者")),
  };
  return {
    input: {
      roomId: "persistent-farm",
      playerId,
      intelligence: 7,
      state,
      candidates,
    },
    fallback: baseline,
  };
}

type FetchLike = typeof fetch;

const SYSTEM_PROMPT =
  "你是长期社交农场的每日市场解说员。价格已经由规则系统冻结，所有候选方案的数值完全相同；你只能选择最贴合当前库存与天气的展示文案。不得编造或修改价格。不要输出解释，只返回 JSON，格式严格为 {\"i\":0}。";

function compactPrompt(
  input: BotDecisionInput<FarmMarketCompactState, FarmingMarketDecision>,
): string {
  return JSON.stringify({
    day: input.state.day,
    level: input.state.level,
    coins: input.state.coins,
    seeds: input.state.seeds,
    produce: input.state.produce,
    planted: input.state.planted,
    prices: input.state.prices,
    trends: input.state.trends,
    recentOperations: input.state.recentOperations,
    options: input.candidates.map((candidate, index) => ({
      i: index,
      title: candidate.title,
      tone: candidate.tone,
      prices: candidate.prices,
    })),
  });
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
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

function responseUsage(
  payload: unknown,
  prompt: string,
  completion: string,
): { promptTokens: number; completionTokens: number } {
  const usage = payload && typeof payload === "object"
    ? (payload as {
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      }).usage
    : undefined;
  return {
    promptTokens: typeof usage?.prompt_tokens === "number"
      ? Math.max(0, Math.ceil(usage.prompt_tokens))
      : estimateTokens(prompt),
    completionTokens: typeof usage?.completion_tokens === "number"
      ? Math.max(0, Math.ceil(usage.completion_tokens))
      : estimateTokens(completion),
  };
}

function parseCandidateIndex(
  completion: string,
  candidateCount: number,
): { candidateIndex: number | null; failureReason?: BotDecisionFailureReason } {
  if (!completion.trim()) {
    return { candidateIndex: null, failureReason: "empty_content" };
  }
  try {
    const parsed = JSON.parse(completion) as { i?: unknown };
    if (!Number.isSafeInteger(parsed.i)) {
      return { candidateIndex: null, failureReason: "invalid_candidate" };
    }
    const candidateIndex = Number(parsed.i);
    return candidateIndex >= 0 && candidateIndex < candidateCount
      ? { candidateIndex }
      : { candidateIndex: null, failureReason: "invalid_candidate" };
  } catch {
    return { candidateIndex: null, failureReason: "invalid_json" };
  }
}

export class OpenAiCompatibleFarmMarketProvider implements
  BotDecisionProvider<FarmMarketCompactState, FarmingMarketDecision> {
  constructor(
    private readonly config: OpenAiCompatibleDoudizhuConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async decide(
    input: BotDecisionInput<FarmMarketCompactState, FarmingMarketDecision>,
  ): Promise<BotDecisionResult> {
    const prompt = compactPrompt(input);
    const usage = { promptTokens: 0, completionTokens: 0 };
    let failureReason: BotDecisionFailureReason = "invalid_json";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = attempt === 0
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT} 上一次回复不可用，请只输出一个 JSON 对象。`;
      const payload = await this.request(instruction, prompt);
      const completion = responseText(payload) ?? "";
      const attemptUsage = responseUsage(
        payload,
        `${instruction}\n${prompt}`,
        completion,
      );
      usage.promptTokens += attemptUsage.promptTokens;
      usage.completionTokens += attemptUsage.completionTokens;
      const parsed = parseCandidateIndex(completion, input.candidates.length);
      if (parsed.candidateIndex !== null) {
        return { candidateIndex: parsed.candidateIndex, usage };
      }
      failureReason = parsed.failureReason ?? "invalid_candidate";
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
                    type: this.config.thinkingEnabled ? "enabled" : "disabled",
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
            ? "Farm market LLM request timed out"
            : "Farm market LLM network request failed",
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new BotDecisionProviderError(
          "http_error",
          `Farm market LLM request failed with HTTP ${response.status}`,
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw new BotDecisionProviderError(
          "invalid_json",
          "Farm market LLM response envelope was not valid JSON",
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
