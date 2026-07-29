import type { AppConfig } from "../config.js";
import { BotDecisionRegistry } from "./decision-registry.js";
import { OpenAiCompatibleDoudizhuProvider } from "./doudizhu-llm.js";
import { OpenAiCompatibleFarmMarketProvider } from "./farm-market-llm.js";
import { OpenAiCompatibleSanguoshaProvider } from "./sanguosha-llm.js";

export function createBotDecisionRegistry(config?: AppConfig): BotDecisionRegistry {
  const registry = new BotDecisionRegistry();
  if (config?.doudizhuLlm) {
    const providerConfig = {
      endpoint: config.doudizhuLlm.endpoint,
      apiKey: config.doudizhuLlm.apiKey,
      model: config.doudizhuLlm.model,
      timeoutMs: config.doudizhuLlm.timeoutMs,
      maximumOutputTokens: config.doudizhuLlm.maximumOutputTokens,
    };
    registry
      .register("doudizhu", new OpenAiCompatibleDoudizhuProvider(providerConfig))
      .register("sanguosha", new OpenAiCompatibleSanguoshaProvider(providerConfig))
      .register("farm", new OpenAiCompatibleFarmMarketProvider(providerConfig));
  }
  return registry;
}
