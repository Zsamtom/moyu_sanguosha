import {
  FARM_CROP_IDS,
  FARM_CROPS,
  type FarmCropId,
  type FarmGameState,
  type FarmMarketDecision,
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
  readonly day: number;
  readonly coins: number;
  readonly seeds: Record<FarmCropId, number>;
  readonly produce: Record<FarmCropId, number>;
  readonly planted: Record<FarmCropId, number>;
  readonly prices: Record<FarmCropId, number>;
  readonly trends: Record<FarmCropId, -1 | 0 | 1>;
  readonly recentOperations: readonly string[];
}

export interface FarmMarketDecisionRequest {
  readonly input: BotDecisionInput<FarmMarketCompactState, FarmMarketDecision>;
  readonly fallback: FarmMarketDecision;
}

function clampPrice(cropId: FarmCropId, value: number): number {
  const crop = FARM_CROPS[cropId];
  return Math.max(crop.minimumPrice, Math.min(crop.maximumPrice, Math.round(value)));
}

function priceMap(
  state: FarmGameState,
  changes: Partial<Record<FarmCropId, number>> = {},
): Record<FarmCropId, number> {
  return Object.fromEntries(FARM_CROP_IDS.map((cropId) => [
    cropId,
    clampPrice(cropId, changes[cropId] ?? state.market[cropId].price),
  ])) as Record<FarmCropId, number>;
}

function scenario(
  state: FarmGameState,
  title: string,
  summary: string,
  tone: FarmMarketDecision["tone"],
  changes?: Partial<Record<FarmCropId, number>>,
): FarmMarketDecision {
  return { title, summary, tone, prices: priceMap(state, changes) };
}

export function createFarmMarketDecision(
  game: FarmGameState,
  playerId: string,
): FarmMarketDecisionRequest | null {
  if (game.status !== "playing") return null;
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;

  const baseline = scenario(
    game,
    "常规供需",
    "今日批发市场供需平稳，沿用规则市场生成的基准报价。",
    "neutral",
  );
  const candidates: FarmMarketDecision[] = [
    baseline,
    scenario(game, "粮站集中采购", "区域粮站扩大收储，小麦报价明显上行。", "surge", {
      wheat: FARM_CROPS.wheat.maximumPrice,
    }),
    scenario(game, "餐饮订单增长", "餐饮渠道补充鲜食库存，番茄需求快速增长。", "surge", {
      tomato: FARM_CROPS.tomato.maximumPrice,
    }),
    scenario(game, "节庆备货", "节庆采购提前启动，南瓜订单进入高位区间。", "surge", {
      pumpkin: FARM_CROPS.pumpkin.maximumPrice,
    }),
    scenario(game, "粮仓释放库存", "公共粮仓释放库存，小麦短期承压。", "crash", {
      wheat: FARM_CROPS.wheat.minimumPrice,
    }),
    scenario(game, "鲜食集中到货", "周边产区集中到货，番茄批发价回落。", "crash", {
      tomato: FARM_CROPS.tomato.minimumPrice,
    }),
    scenario(game, "大宗订单取消", "采购方取消大宗订单，南瓜库存积压。", "crash", {
      pumpkin: FARM_CROPS.pumpkin.minimumPrice,
    }),
    scenario(game, "运输节点波动", "运输节点临时调整，三类作物报价出现分化。", "volatile", {
      wheat: FARM_CROPS.wheat.maximumPrice,
      tomato: FARM_CROPS.tomato.minimumPrice,
      pumpkin: Math.round(
        (FARM_CROPS.pumpkin.minimumPrice + FARM_CROPS.pumpkin.maximumPrice) / 2,
      ),
    }),
  ];
  const planted = Object.fromEntries(FARM_CROP_IDS.map((cropId) => [
    cropId,
    player.plots.filter((plot) => plot.cropId === cropId).length,
  ])) as Record<FarmCropId, number>;
  const state: FarmMarketCompactState = {
    day: game.day,
    coins: player.coins,
    seeds: { ...player.seeds },
    produce: { ...player.produce },
    planted,
    prices: priceMap(game),
    trends: Object.fromEntries(FARM_CROP_IDS.map((cropId) => [
      cropId,
      game.market[cropId].trend,
    ])) as Record<FarmCropId, -1 | 0 | 1>,
    recentOperations: game.logs
      .slice(-6)
      .map((entry) => entry.text.replaceAll(player.name, "经营者")),
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
  "你是单人农场经营游戏的市场导演。根据玩家资产、库存、田地、当前报价和最近操作，在给定的合法行情方案中选择最能形成风险与机会平衡的一项。不要编造价格，不要输出解释。只返回 JSON，格式严格为 {\"i\":0}。";

function compactPrompt(
  input: BotDecisionInput<FarmMarketCompactState, FarmMarketDecision>,
): string {
  return JSON.stringify({
    day: input.state.day,
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
  BotDecisionProvider<FarmMarketCompactState, FarmMarketDecision> {
  constructor(
    private readonly config: OpenAiCompatibleDoudizhuConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async decide(
    input: BotDecisionInput<FarmMarketCompactState, FarmMarketDecision>,
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
