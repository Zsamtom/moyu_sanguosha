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

const MAX_LLM_CANDIDATES = 10;
const STABLE_CANDIDATE_ORDERING_LEVEL: DoudizhuBotIntelligence = 7;

export interface DoudizhuCompactState {
  readonly phase: "bid" | "play";
  readonly role: DoudizhuRole | null;
  readonly seat: number;
  readonly hand: readonly DoudizhuCard[];
  readonly players: readonly {
    readonly seat: number;
    readonly role: DoudizhuRole | null;
    readonly handCount: number;
  }[];
  readonly currentBid: 0 | 1 | 2 | 3;
  readonly multiplier: number;
  readonly trick: {
    readonly ownerSeat: number;
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

export function createDoudizhuDecision(
  roomId: string,
  game: DoudizhuGameState,
  playerId: string,
  intelligence: DoudizhuBotIntelligence,
): DoudizhuDecision | null {
  const view = getDoudizhuGameView(game, playerId);
  const own = view.players.find((player) => player.id === playerId);
  if (!own?.hand) return null;
  // Keep the legal candidate boundary identical at every intelligence level.
  // Intelligence affects only the model instruction, never whether it is
  // called or which local heuristic happens to order its candidate set.
  const ordered = listDoudizhuBotActions(
    game,
    playerId,
    STABLE_CANDIDATE_ORDERING_LEVEL,
  );
  const fallback = ordered[0];
  if (!fallback) return null;
  const candidates = ordered.slice(0, MAX_LLM_CANDIDATES);
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
    seat: own.seat,
    hand: own.hand,
    players: view.players.map((player) => ({
      seat: player.seat,
      role: player.role ?? null,
      handCount: player.handCount,
    })),
    currentBid: view.bid.currentBid,
    multiplier: view.multiplier,
    trick: view.trick
      ? {
          ownerSeat: trickOwner?.seat ?? -1,
          ownerRole: trickOwner?.role ?? null,
          type: view.trick.pattern.type,
          rank: view.trick.pattern.primaryRank,
          length: view.trick.pattern.length,
      }
      : null,
  };
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
    estimatedPromptTokens: estimateTokens(
      `${systemPrompt(intelligence)}\n${compactPrompt(input)}`,
    ),
  };
}

export interface OpenAiCompatibleDoudizhuConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maximumOutputTokens: number;
  readonly thinkingEnabled?: boolean;
  readonly jsonOutput?: boolean;
}

type FetchLike = typeof fetch;

const BASE_SYSTEM_PROMPT =
  "Choose one legal Dou Dizhu option index. Reply JSON only: {\"i\":0}.";

const INTELLIGENCE_PROMPTS: Record<DoudizhuBotIntelligence, string> = {
  1: "L1 novice: prefer the first simple low-rank option; avoid bombs.",
  2: "L2 basic: prefer low-cost plays and do not waste strong cards.",
  3: "L3 capable: balance shedding cards, rank cost, and sensible bidding.",
  4: "L4 skilled: track public hand counts; preserve bombs unless decisive.",
  5: "L5 team: as farmer, cooperate and avoid overtaking a safe teammate lead.",
  6: "L6 advanced: block near-out opponents and compare remaining hand structure.",
  7: "L7 expert: minimize turns to finish, coordinate farmers, preserve bombs unless decisive, and stop immediate threats.",
};

export function systemPrompt(
  intelligence: DoudizhuBotIntelligence,
): string {
  return `${BASE_SYSTEM_PROMPT} ${INTELLIGENCE_PROMPTS[intelligence]}`;
}

const RANK_CODES: Record<DoudizhuRank, string> = {
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "T",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
  "2": "2",
  small_joker: "x",
  big_joker: "X",
};

const PATTERN_CODES: Record<DoudizhuPatternType, string> = {
  single: "s",
  pair: "p",
  triple: "t",
  triple_single: "t1",
  triple_pair: "t2",
  straight: "q",
  consecutive_pairs: "c",
  airplane: "a",
  airplane_singles: "a1",
  airplane_pairs: "a2",
  four_two_singles: "f1",
  four_two_pairs: "f2",
  bomb: "b",
  rocket: "r",
};

function roleCode(role: DoudizhuRole | null): string {
  return role === "landlord" ? "l" : role === "farmer" ? "f" : "-";
}

function rankCode(rank: DoudizhuRank): string {
  return RANK_CODES[rank];
}

function cardRanks(cards: readonly DoudizhuCard[]): string {
  return cards.map((card) => rankCode(card.rank)).join("");
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function compactAction(
  action: DoudizhuAction,
  handById: ReadonlyMap<string, DoudizhuCard>,
): unknown {
  if (action.type === "doudizhu_bid") return ["b", action.score];
  if (action.type === "doudizhu_pass") return "x";
  const cards = action.cardIds
    .map((id) => handById.get(id))
    .filter((card): card is DoudizhuCard => Boolean(card));
  const pattern = parseDoudizhuPattern(cards);
  return [
    pattern ? PATTERN_CODES[pattern.type] : "?",
    pattern ? rankCode(pattern.primaryRank) : "?",
    cardRanks(cards),
  ];
}

function compactPrompt(
  input: BotDecisionInput<DoudizhuCompactState, DoudizhuAction>,
): string {
  const { state } = input;
  const handById = new Map(state.hand.map((card) => [card.id, card]));
  return JSON.stringify({
    p: state.phase === "bid" ? "b" : "p",
    r: roleCode(state.role),
    s: state.seat,
    h: cardRanks(state.hand),
    n: state.players.map((player) => [
      player.seat,
      roleCode(player.role),
      player.handCount,
    ]),
    b: state.currentBid,
    m: state.multiplier,
    t: state.trick
      ? [
          state.trick.ownerSeat,
          roleCode(state.trick.ownerRole),
          PATTERN_CODES[state.trick.type],
          rankCode(state.trick.rank),
          state.trick.length,
        ]
      : 0,
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
    const instruction = systemPrompt(input.intelligence);
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
              content: instruction,
            },
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
      if (!response.ok) {
        throw new Error(`LLM bot request failed with HTTP ${response.status}`);
      }
      payload = await response.json();
    } finally {
      clearTimeout(timeout);
    }
    const completion = responseText(payload) ?? "";
    const usage = responseUsage(payload, `${instruction}\n${prompt}`, completion);
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
