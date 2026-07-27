import {
  getGameView,
  type Card,
  type GameAction,
  type GameSession,
  type GameView,
  type Role,
} from "@sanguosha/shared";
import type { BotIntelligence } from "../bot-intelligence.js";
import type {
  BotDecisionFailureReason,
  BotDecisionInput,
  BotDecisionProvider,
  BotDecisionResult,
} from "./decision-registry.js";
import { BotDecisionProviderError } from "./decision-registry.js";
import type { OpenAiCompatibleDoudizhuConfig } from "./doudizhu-llm.js";

export interface SanguoshaCompactState {
  readonly phase: string;
  readonly self: {
    readonly seat: number;
    readonly role: Role | null;
    readonly hp: number;
    readonly maxHp: number;
    readonly generalId: string | null;
    readonly hand: readonly Card[];
  };
  readonly players: readonly {
    readonly id: string;
    readonly seat: number;
    readonly alive: boolean;
    readonly hp: number;
    readonly maxHp: number;
    readonly handCount: number;
    readonly role: Role | null;
    readonly generalId: string | null;
    readonly equipment: readonly Card[];
    readonly judgment: readonly Card[];
  }[];
  readonly prompt: GameView["prompt"];
  readonly publicCards: readonly Card[];
}

export interface SanguoshaDecision {
  readonly input: BotDecisionInput<SanguoshaCompactState, GameAction>;
  readonly fallback: GameAction;
  readonly estimatedPromptTokens: number;
}

export function createSanguoshaDecision(
  roomId: string,
  game: GameSession,
  playerId: string,
  intelligence: BotIntelligence,
  candidates: readonly GameAction[],
  fallback: GameAction,
): SanguoshaDecision | null {
  if (candidates.length === 0) return null;
  const view = getGameView(game, playerId);
  const self = view.players.find((player) => player.id === playerId);
  if (!self?.hand) return null;
  const state: SanguoshaCompactState = {
    phase: view.turn.phase,
    self: {
      seat: self.seat,
      role: self.role,
      hp: self.hp,
      maxHp: self.maxHp,
      generalId: self.general?.id ?? null,
      hand: self.hand,
    },
    players: view.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      alive: player.alive,
      hp: player.hp,
      maxHp: player.maxHp,
      handCount: player.handCount,
      role: player.role,
      generalId: player.general?.id ?? null,
      equipment: player.equipment,
      judgment: player.judgment,
    })),
    prompt: view.prompt,
    publicCards: view.publicCards,
  };
  const input = {
    roomId,
    playerId,
    intelligence,
    state,
    candidates,
  } satisfies BotDecisionInput<SanguoshaCompactState, GameAction>;
  return {
    input,
    fallback,
    estimatedPromptTokens: estimateTokens(
      `${sanguoshaSystemPrompt(intelligence)}\n${compactPrompt(input)}`,
    ),
  };
}

const BASE_SYSTEM_PROMPT =
  "Choose one legal Sanguosha option index. Never invent an action. Reply JSON only: {\"i\":0}.";

const INTELLIGENCE_PROMPTS: Record<BotIntelligence, string> = {
  1: "L1 novice: prefer the simplest immediate action and obvious survival.",
  2: "L2 basic: conserve Peach and Dodge; use straightforward cards.",
  3: "L3 capable: balance damage, healing, defense, and hand economy.",
  4: "L4 skilled: consider visible roles, HP, equipment, and turn tempo.",
  5: "L5 tactical: cooperate by role, focus threats, and preserve key responses.",
  6: "L6 advanced: value card advantage, lethal lines, target order, and skill timing.",
  7: "L7 expert: infer hidden roles from public state, optimize team win probability, and prevent immediate threats.",
};

export function sanguoshaSystemPrompt(intelligence: BotIntelligence): string {
  return `${BASE_SYSTEM_PROMPT} ${INTELLIGENCE_PROMPTS[intelligence]}`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function roleCode(role: Role | null): string {
  if (role === "lord") return "l";
  if (role === "loyalist") return "y";
  if (role === "rebel") return "r";
  if (role === "renegade") return "n";
  return "-";
}

function cardCode(card: Card | undefined): unknown {
  return card ? [card.kind, card.suit[0], card.rank] : "?";
}

function compactPrompt(
  input: BotDecisionInput<SanguoshaCompactState, GameAction>,
): string {
  const { state } = input;
  const seatById = new Map(state.players.map((player) => [player.id, player.seat]));

  const cards = [
    ...state.self.hand,
    ...state.players.flatMap((player) => [...player.equipment, ...player.judgment]),
    ...state.publicCards,
    ...(state.prompt.type === "standard_skill" ||
      state.prompt.type === "amazing_grace_selection"
        ? state.prompt.cards
        : []),
  ];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const prompt = state.prompt as unknown as Record<string, unknown>;
  const promptInfo: Record<string, unknown> = { t: state.prompt.type };
  for (const key of ["skillId", "stage", "responseKind", "context", "cardKind", "weaponKind", "armorKind"]) {
    if (typeof prompt[key] === "string") promptInfo[key[0]!] = prompt[key];
  }
  for (const key of ["sourceId", "targetId", "victimId", "attackerId", "effectTargetId", "opponentId", "requesterId"]) {
    if (typeof prompt[key] === "string") promptInfo[key[0]!] = seatById.get(prompt[key] as string) ?? -1;
  }
  if (typeof prompt.canPass === "boolean") promptInfo.x = prompt.canPass ? 1 : 0;

  const compactAction = (action: GameAction): unknown => {
    const record = action as unknown as Record<string, unknown>;
    const result: Record<string, unknown> = { t: action.type };
    if (typeof record.skillId === "string") result.s = record.skillId;
    if (typeof record.activate === "boolean") result.a = record.activate ? 1 : 0;
    if (typeof record.challenge === "boolean") result.h = record.challenge ? 1 : 0;
    if (typeof record.suit === "string") result.u = record.suit[0];
    if ("cardId" in record) {
      result.c = record.cardId === null
        ? 0
        : cardCode(cardById.get(String(record.cardId)));
    }
    if (Array.isArray(record.cardIds)) {
      result.c = record.cardIds.map((id) => cardCode(cardById.get(String(id))));
    }
    if (typeof record.targetId === "string") result.g = seatById.get(record.targetId) ?? -1;
    if (Array.isArray(record.targetIds)) {
      result.g = record.targetIds.map((id) => seatById.get(String(id)) ?? -1);
    }
    if (Array.isArray(record.allocations)) {
      result.d = record.allocations.map((allocation) => {
        const item = allocation as Record<string, unknown>;
        return [seatById.get(String(item.targetId)) ?? -1, item.damage ?? cardCode(cardById.get(String(item.cardId)))];
      });
    }
    if (Array.isArray(record.tokens)) result.o = record.tokens.length;
    return result;
  };

  return JSON.stringify({
    p: state.phase,
    s: [
      state.self.seat,
      roleCode(state.self.role),
      state.self.hp,
      state.self.maxHp,
      state.self.generalId,
      state.self.hand.map((card) => cardCode(card)),
    ],
    n: state.players.map((player) => [
      player.seat,
      player.alive ? 1 : 0,
      player.hp,
      player.maxHp,
      player.handCount,
      roleCode(player.role),
      player.generalId,
      player.equipment.map((card) => card.kind),
      player.judgment.map((card) => card.kind),
    ]),
    q: promptInfo,
    o: input.candidates.map(compactAction),
  });
}

function responseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content : null;
}

export class OpenAiCompatibleSanguoshaProvider implements
  BotDecisionProvider<SanguoshaCompactState, GameAction> {
  constructor(
    private readonly config: OpenAiCompatibleDoudizhuConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async decide(
    input: BotDecisionInput<SanguoshaCompactState, GameAction>,
  ): Promise<BotDecisionResult> {
    const prompt = compactPrompt(input);
    const instruction = sanguoshaSystemPrompt(input.intelligence);
    const resultUsage = { promptTokens: 0, completionTokens: 0 };
    let failureReason: BotDecisionFailureReason = "invalid_json";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptInstruction = attempt === 0
        ? instruction
        : `${instruction} Retry: output one JSON object and nothing else.`;
      let payload: unknown;
      try {
        payload = await this.request(attemptInstruction, prompt);
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof BotDecisionProviderError &&
          error.reason === "invalid_json"
        ) {
          continue;
        }
        throw error;
      }
      const completion = responseText(payload) ?? "";
      const usage = payload && typeof payload === "object"
        ? (payload as {
            usage?: {
              prompt_tokens?: unknown;
              completion_tokens?: unknown;
            };
          }).usage
        : undefined;
      resultUsage.promptTokens += typeof usage?.prompt_tokens === "number"
        ? Math.max(0, Math.ceil(usage.prompt_tokens))
        : estimateTokens(`${attemptInstruction}\n${prompt}`);
      resultUsage.completionTokens +=
        typeof usage?.completion_tokens === "number"
          ? Math.max(0, Math.ceil(usage.completion_tokens))
          : estimateTokens(completion);
      if (!completion.trim()) {
        failureReason = "empty_content";
        continue;
      }
      try {
        const parsed = JSON.parse(completion) as { i?: unknown };
        if (!Number.isSafeInteger(parsed.i)) {
          failureReason = "invalid_candidate";
          continue;
        }
        const candidateIndex = Number(parsed.i);
        if (
          candidateIndex < 0 ||
          candidateIndex >= input.candidates.length
        ) {
          failureReason = "invalid_candidate";
          continue;
        }
        return { candidateIndex, usage: resultUsage };
      } catch {
        failureReason = "invalid_json";
      }
    }
    return { candidateIndex: null, usage: resultUsage, failureReason };
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
            ? "Sanguosha LLM request timed out"
            : "Sanguosha LLM network request failed",
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new BotDecisionProviderError(
          "http_error",
          `Sanguosha LLM request failed with HTTP ${response.status}`,
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw new BotDecisionProviderError(
          "invalid_json",
          "Sanguosha LLM response envelope was not valid JSON",
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
