import { describe, expect, it, vi } from "vitest";
import {
  OpenAiCompatibleSanguoshaProvider,
  sanguoshaSystemPrompt,
  type SanguoshaCompactState,
} from "./sanguosha-llm.js";

const state: SanguoshaCompactState = {
  phase: "play",
  self: {
    seat: 0,
    role: "lord",
    hp: 3,
    maxHp: 4,
    generalId: "cao_cao",
    hand: [],
  },
  players: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      seat: 0,
      alive: true,
      hp: 3,
      maxHp: 4,
      handCount: 2,
      role: "lord",
      generalId: "cao_cao",
      equipment: [],
      judgment: [],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      seat: 1,
      alive: true,
      hp: 1,
      maxHp: 4,
      handCount: 3,
      role: null,
      generalId: "liu_bei",
      equipment: [],
      judgment: [],
    },
  ],
  prompt: {
    type: "play",
    playerId: "11111111-1111-4111-8111-111111111111",
    cards: [],
    skills: [],
    zhangBaSlash: null,
  },
  publicCards: [],
};

describe("Sanguosha LLM provider", () => {
  it("uses seven distinct intelligence prompts", () => {
    const prompts = ([1, 2, 3, 4, 5, 6, 7] as const).map(sanguoshaSystemPrompt);
    expect(new Set(prompts).size).toBe(7);
    expect(prompts[0]).toContain("L1 novice");
    expect(prompts[6]).toContain("L7 expert");
  });

  it("sends only a compact stateless candidate-selection request", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
        thinking: { type: string };
        response_format: { type: string };
      };
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]?.content).toContain("L7 expert");
      expect(body.messages[1]?.content).toContain('"o"');
      expect(body.messages[1]?.content).not.toContain("11111111-1111-4111-8111-111111111111");
      expect(body.max_tokens).toBe(16);
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.response_format).toEqual({ type: "json_object" });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"i\":0}" } }],
        usage: { prompt_tokens: 42, completion_tokens: 4 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OpenAiCompatibleSanguoshaProvider({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      timeoutMs: 4_000,
      maximumOutputTokens: 16,
      thinkingEnabled: false,
      jsonOutput: true,
    }, fetcher);

    await expect(provider.decide({
      roomId: "room",
      playerId: state.players[0]!.id,
      intelligence: 7,
      state,
      candidates: [{ type: "end_play", playerId: state.players[0]!.id }],
    })).resolves.toEqual({
      candidateIndex: 0,
      usage: { promptTokens: 42, completionTokens: 4 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
