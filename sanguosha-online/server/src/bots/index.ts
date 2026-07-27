import type { AppConfig } from "../config.js";
import { BotDecisionRegistry } from "./decision-registry.js";
import { OpenAiCompatibleDoudizhuProvider } from "./doudizhu-llm.js";

export function createBotDecisionRegistry(config: AppConfig): BotDecisionRegistry {
  const registry = new BotDecisionRegistry();
  if (config.doudizhuLlm) {
    registry.register(
      "doudizhu",
      new OpenAiCompatibleDoudizhuProvider({
        endpoint: config.doudizhuLlm.endpoint,
        apiKey: config.doudizhuLlm.apiKey,
        model: config.doudizhuLlm.model,
        timeoutMs: config.doudizhuLlm.timeoutMs,
        maximumOutputTokens: config.doudizhuLlm.maximumOutputTokens,
      }),
    );
  }
  return registry;
}
