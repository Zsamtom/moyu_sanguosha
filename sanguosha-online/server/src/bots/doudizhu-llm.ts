import {
  getDoudizhuGameView,
  estimateDoudizhuRemainingTurns,
  listDoudizhuBotActions,
  parseDoudizhuPattern,
  type DoudizhuAction,
  type DoudizhuBotIntelligence,
  type DoudizhuCard,
  type DoudizhuGameState,
  type DoudizhuLogEntry,
  type DoudizhuPatternType,
  type DoudizhuRank,
  type DoudizhuRole,
} from "@sanguosha/shared";
import type {
  BotDecisionFailureReason,
  BotDecisionInput,
  BotDecisionProvider,
  BotDecisionResult,
} from "./decision-registry.js";
import { BotDecisionProviderError } from "./decision-registry.js";

export interface DoudizhuLlmUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  fallbacks: number;
  lastFailureReason: BotDecisionFailureReason | null;
}

export const EMPTY_DOUDIZHU_LLM_USAGE: DoudizhuLlmUsage = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  fallbacks: 0,
  lastFailureReason: null,
};

const MAX_LLM_CANDIDATES = 20;
const RECENT_PUBLIC_ACTIONS = 12;
const STABLE_CANDIDATE_ORDERING_LEVEL: DoudizhuBotIntelligence = 7;

interface DoudizhuCompactHistoryEntry {
  readonly seat: number;
  readonly type: "bid" | "play" | "pass";
  readonly score?: 0 | 1 | 2 | 3;
  readonly pattern?: {
    readonly type: DoudizhuPatternType;
    readonly rank: DoudizhuRank;
    readonly length: number;
    readonly ranks: readonly DoudizhuRank[];
  };
}

export interface DoudizhuCompactState {
  readonly phase: "bid" | "play";
  readonly role: DoudizhuRole | null;
  readonly seat: number;
  readonly hand: readonly DoudizhuCard[];
  readonly players: readonly {
    readonly seat: number;
    readonly role: DoudizhuRole | null;
    readonly handCount: number;
    readonly playedCount: number;
  }[];
  readonly bottomCards: readonly DoudizhuCard[];
  readonly playedRanks: readonly DoudizhuRank[];
  readonly history: readonly DoudizhuCompactHistoryEntry[];
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

function projectHistoryEntry(
  log: DoudizhuLogEntry,
): DoudizhuCompactHistoryEntry | null {
  if (log.actorSeat === undefined) return null;
  if (log.type === "bid") {
    return {
      seat: log.actorSeat,
      type: "bid",
      ...(log.bidScore === undefined ? {} : { score: log.bidScore }),
    };
  }
  if (log.type === "pass") {
    return { seat: log.actorSeat, type: "pass" };
  }
  if (log.type !== "play" || !log.pattern) return null;
  return {
    seat: log.actorSeat,
    type: "play",
    pattern: {
      type: log.pattern.type,
      rank: log.pattern.primaryRank,
      length: log.pattern.length,
      ranks: log.pattern.ranks,
    },
  };
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
      playedCount: player.playedCount,
    })),
    bottomCards: view.bottomCards,
    playedRanks: view.logs.flatMap((log) => log.pattern?.ranks ?? []),
    history: view.logs.slice(-RECENT_PUBLIC_ACTIONS)
      .map(projectHistoryEntry)
      .filter((entry): entry is DoudizhuCompactHistoryEntry =>
        entry !== null
      ),
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
  "Choose one legal Dou Dizhu option index after planning the remaining hand. Input JSON codes: p=phase(b bid/p play), r=role(l landlord/f farmer), s=seat, h=own ranks, n=players [seat,role,handCount,playedTurns], d=public bottom ranks, b=current bid, m=multiplier, t=current trick [seat,role,pattern,rank,length], u=all publicly played ranks, a=recent actions, o=legal options [move,remainingRanks,estimatedTurns]. Moves: b=bid, x=pass; s/p/t/t1/t2/q/c/a/a1/a2/f1/f2/b/r are single/pair/triple/triple-single/triple-pair/straight/consecutive-pairs/airplane/airplane-singles/airplane-pairs/four-two-singles/four-two-pairs/bomb/rocket. Reply JSON only, exactly {\"i\":0}.";

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
  hand: readonly DoudizhuCard[],
  handById: ReadonlyMap<string, DoudizhuCard>,
): unknown {
  if (action.type === "doudizhu_bid") {
    return [
      ["b", action.score],
      cardRanks(hand),
      estimateDoudizhuRemainingTurns(hand),
    ];
  }
  if (action.type === "doudizhu_pass") {
    return ["x", cardRanks(hand), estimateDoudizhuRemainingTurns(hand)];
  }
  const cards = action.cardIds
    .map((id) => handById.get(id))
    .filter((card): card is DoudizhuCard => Boolean(card));
  const pattern = parseDoudizhuPattern(cards);
  const playedIds = new Set(action.cardIds);
  const remaining = hand.filter((card) => !playedIds.has(card.id));
  return [
    [
      pattern ? PATTERN_CODES[pattern.type] : "?",
      pattern ? rankCode(pattern.primaryRank) : "?",
      cardRanks(cards),
    ],
    cardRanks(remaining),
    estimateDoudizhuRemainingTurns(remaining),
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
      player.playedCount,
    ]),
    d: cardRanks(state.bottomCards),
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
    u: state.playedRanks.map(rankCode).join(""),
    a: state.history.map((entry) => {
      if (entry.type === "bid") return [entry.seat, "b", entry.score ?? 0];
      if (entry.type === "pass") return [entry.seat, "x"];
      return [
        entry.seat,
        "p",
        entry.pattern ? PATTERN_CODES[entry.pattern.type] : "?",
        entry.pattern ? rankCode(entry.pattern.rank) : "?",
        entry.pattern?.length ?? 0,
        entry.pattern?.ranks.map(rankCode).join("") ?? "",
      ];
    }),
    o: input.candidates.map((action) =>
      compactAction(action, state.hand, handById)
    ),
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
    const usage = { promptTokens: 0, completionTokens: 0 };
    let failureReason: BotDecisionFailureReason = "invalid_json";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptInstruction = attempt === 0
        ? instruction
        : `${instruction} Retry: the previous response was unusable; output one JSON object and nothing else.`;
      let payload: unknown;
      try {
        payload = await this.request(attemptInstruction, prompt);
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof BotDecisionProviderError &&
          error.reason === "invalid_json"
        ) {
          failureReason = "invalid_json";
          continue;
        }
        throw error;
      }
      const completion = responseText(payload) ?? "";
      const attemptUsage = responseUsage(
        payload,
        `${attemptInstruction}\n${prompt}`,
        completion,
      );
      usage.promptTokens += attemptUsage.promptTokens;
      usage.completionTokens += attemptUsage.completionTokens;
      const parsed = parseCandidateIndex(
        completion,
        input.candidates.length,
      );
      if (parsed.candidateIndex !== null) {
        return { candidateIndex: parsed.candidateIndex, usage };
      }
      failureReason = parsed.failureReason ?? "invalid_candidate";
    }
    return { candidateIndex: null, usage, failureReason };
  }

  private async request(
    instruction: string,
    prompt: string,
  ): Promise<unknown> {
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
            ? "LLM bot request timed out"
            : "LLM bot network request failed",
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new BotDecisionProviderError(
          "http_error",
          `LLM bot request failed with HTTP ${response.status}`,
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw new BotDecisionProviderError(
          "invalid_json",
          "LLM bot response envelope was not valid JSON",
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
