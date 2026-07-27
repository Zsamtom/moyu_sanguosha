import {
  getDoudizhuGameView,
  listDoudizhuBotActions,
  parseDoudizhuPattern,
  type DoudizhuAction,
  type DoudizhuBotIntelligence,
  type DoudizhuCard,
  type DoudizhuGameState,
  type DoudizhuPatternType,
  type DoudizhuRank,
  type DoudizhuRole,
} from "@sanguosha/shared";
import type {
  BotDecisionInput,
  BotDecisionProvider,
  BotDecisionResult,
} from "./decision-registry.js";

export interface DoudizhuLlmUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  fallbacks: number;
}

export const EMPTY_DOUDIZHU_LLM_USAGE: DoudizhuLlmUsage = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  fallbacks: 0,
};

const CALL_BUDGET_BY_INTELLIGENCE: Record<DoudizhuBotIntelligence, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 6,
  6: 8,
  7: 10,
};

const CANDIDATE_LIMIT_BY_INTELLIGENCE: Record<DoudizhuBotIntelligence, number> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: 10,
};

export interface DoudizhuCompactState {
  readonly phase: "bid" | "play";
  readonly role: DoudizhuRole | null;
  readonly hand: readonly DoudizhuCard[];
  readonly players: readonly {
    readonly seat: number;
    readonly role: DoudizhuRole | null;
    readonly handCount: number;
    readonly playedCount: number;
  }[];
  readonly currentBid: 0 | 1 | 2 | 3;
  readonly multiplier: number;
  readonly trick: {
    readonly ownerRole: DoudizhuRole | null;
    readonly type: DoudizhuPatternType;
    readonly rank: DoudizhuRank;
    readonly length: number;
  } | null;
}

export interface DoudizhuDecision {
  readonly input: BotDecisionInput<DoudizhuCompactState, DoudizhuAction>;
  readonly fallback: DoudizhuAction;
  readonly estimatedPromptTokens: number;
}

export function doudizhuLlmBudgetAvailable(
  intelligence: DoudizhuBotIntelligence,
  usage: DoudizhuLlmUsage,
  maximumPromptTokens = 3_500,
  nextPromptTokens = 1,
): boolean {
  return usage.calls < CALL_BUDGET_BY_INTELLIGENCE[intelligence] &&
    usage.promptTokens + nextPromptTokens <= maximumPromptTokens;
}

function shouldConsult(
  state: DoudizhuCompactState,
  intelligence: DoudizhuBotIntelligence,
  candidates: readonly DoudizhuAction[],
): boolean {
  if (candidates.length <= 1) return false;
  if (state.phase === "bid") return intelligence >= 3;
  const ownCount = state.hand.length;
  const opponentCounts = state.players
    .filter((player) => player.role !== state.role)
    .map((player) => player.handCount);
  const closestOpponent = Math.min(...opponentCounts);
  const hasBombChoice = candidates.some((action) => {
    if (action.type !== "doudizhu_play") return false;
    const cards = action.cardIds
      .map((id) => state.hand.find((card) => card.id === id))
      .filter((card): card is DoudizhuCard => Boolean(card));
    const type = parseDoudizhuPattern(cards)?.type;
    return type === "bomb" || type === "rocket";
  });
  const endgameThreshold = Math.max(2, intelligence);
  return ownCount <= endgameThreshold ||
    closestOpponent <= Math.max(2, intelligence - 2) ||
    (intelligence >= 4 && hasBombChoice) ||
    (intelligence >= 6 && candidates.length >= 3);
}

export function createDoudizhuDecision(
  roomId: string,
  game: DoudizhuGameState,
  playerId: string,
  intelligence: DoudizhuBotIntelligence,
): DoudizhuDecision | null {
  const view = getDoudizhuGameView(game, playerId);
  const own = view.players.find((player) => player.id === playerId);
  if (!own?.hand) return null;
  const ordered = listDoudizhuBotActions(game, playerId, intelligence);
  const fallback = ordered[0];
  if (!fallback) return null;
  const limit = CANDIDATE_LIMIT_BY_INTELLIGENCE[intelligence];
  const candidates = ordered.slice(0, limit);
  const pass = ordered.find((action) => action.type === "doudizhu_pass");
  if (
    pass &&
    !candidates.some((action) => action.type === "doudizhu_pass") &&
    candidates.length > 0
  ) {
    candidates[candidates.length - 1] = pass;
  }
  const trickOwner = view.trick
    ? view.players.find((player) => player.id === view.trick!.fromPlayerId)
    : undefined;
  const state: DoudizhuCompactState = {
    phase: view.phase === "bidding" ? "bid" : "play",
    role: own.role ?? null,
    hand: own.hand,
    players: view.players.map((player) => ({
      seat: player.seat,
      role: player.role ?? null,
      handCount: player.handCount,
      playedCount: player.playedCount,
    })),
    currentBid: view.bid.currentBid,
    multiplier: view.multiplier,
    trick: view.trick
      ? {
          ownerRole: trickOwner?.role ?? null,
          type: view.trick.pattern.type,
          rank: view.trick.pattern.primaryRank,
          length: view.trick.pattern.length,
        }
      : null,
  };
  if (!shouldConsult(state, intelligence, candidates)) return null;
  const input = {
    roomId,
    playerId,
    intelligence,
    state,
    candidates,
  } satisfies BotDecisionInput<DoudizhuCompactState, DoudizhuAction>;
  return {
    input,
    fallback,
    estimatedPromptTokens: estimateTokens(`${SYSTEM_PROMPT}\n${compactPrompt(input)}`),
  };
}

export interface OpenAiCompatibleDoudizhuConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maximumOutputTokens: number;
}

type FetchLike = typeof fetch;

const SYSTEM_PROMPT = "Choose one legal Dou Dizhu option. Reply JSON only: {\"i\":0}. Lower option indexes are locally preferred. Cooperate with a farmer teammate, preserve bombs, and prioritize an immediate win or block.";

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function compactAction(
  action: DoudizhuAction,
  handById: ReadonlyMap<string, DoudizhuCard>,
): unknown {
  if (action.type === "doudizhu_bid") return ["b", action.score];
  if (action.type === "doudizhu_pass") return ["x"];
  const cards = action.cardIds
    .map((id) => handById.get(id))
    .filter((card): card is DoudizhuCard => Boolean(card));
  const pattern = parseDoudizhuPattern(cards);
  return [
    "p",
    pattern?.type ?? "?",
    pattern?.primaryRank ?? "?",
    cards.map((card) => card.rank),
  ];
}

function compactPrompt(
  input: BotDecisionInput<DoudizhuCompactState, DoudizhuAction>,
): string {
  const { state } = input;
  const handById = new Map(state.hand.map((card) => [card.id, card]));
  return JSON.stringify({
    l: input.intelligence,
    p: state.phase,
    r: state.role,
    h: state.hand.map((card) => card.rank),
    n: state.players.map((player) => [
      player.seat,
      player.role,
      player.handCount,
      player.playedCount,
    ]),
    b: state.currentBid,
    m: state.multiplier,
    t: state.trick
      ? [
          state.trick.ownerRole,
          state.trick.type,
          state.trick.rank,
          state.trick.length,
        ]
      : null,
    o: input.candidates.map((action) => compactAction(action, handById)),
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

export class OpenAiCompatibleDoudizhuProvider implements
  BotDecisionProvider<DoudizhuCompactState, DoudizhuAction> {
  constructor(
    private readonly config: OpenAiCompatibleDoudizhuConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async decide(
    input: BotDecisionInput<DoudizhuCompactState, DoudizhuAction>,
  ): Promise<BotDecisionResult> {
    const prompt = compactPrompt(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timeout.unref();
    let payload: unknown;
    try {
      const response = await this.fetcher(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          max_tokens: this.config.maximumOutputTokens,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`LLM bot request failed with HTTP ${response.status}`);
      }
      payload = await response.json();
    } finally {
      clearTimeout(timeout);
    }
    const completion = responseText(payload) ?? "";
    const usage = responseUsage(payload, `${SYSTEM_PROMPT}\n${prompt}`, completion);
    let candidateIndex: number | null = null;
    try {
      const parsed = JSON.parse(completion) as { i?: unknown };
      if (
        Number.isSafeInteger(parsed.i) &&
        Number(parsed.i) >= 0 &&
        Number(parsed.i) < input.candidates.length
      ) {
        candidateIndex = Number(parsed.i);
      }
    } catch {
      candidateIndex = null;
    }
    return { candidateIndex, usage };
  }
}
