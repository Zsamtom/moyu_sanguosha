import { describe, expect, it, vi } from "vitest";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
import {
  LlmSettingsService,
  type LoadedLlmSettings,
  type LlmSettingsStore,
  type PersistedLlmSettings,
} from "./llm-settings.js";

class InspectableSettingsStore implements LlmSettingsStore {
  loaded?: LoadedLlmSettings;

  async load(): Promise<LoadedLlmSettings | undefined> {
    return this.loaded;
  }

  async save(settings: PersistedLlmSettings): Promise<string> {
    const updatedAt = "2026-07-27T00:00:00.000Z";
    this.loaded = { settings, updatedAt };
    return updatedAt;
  }
}

describe("LLM settings service", () => {
  it("never forwards a legacy third-party bootstrap key to DeepSeek", async () => {
    const registry = new BotDecisionRegistry();
    const service = new LlmSettingsService(
      new InspectableSettingsStore(),
      registry,
      "stable-test-encryption-secret",
      {
        endpoint: "https://third-party.example/v1/chat/completions",
        apiKey: "third-party-secret",
        model: "third-party-model",
        timeoutMs: 2_000,
        maximumOutputTokens: 12,
      },
    );
    await service.initialize();

    expect(service.getPublicSettings()).toMatchObject({
      enabled: false,
      model: "deepseek-v4-flash",
      apiKeyConfigured: false,
    });
    expect(registry.supports("doudizhu")).toBe(false);
  });

  it("encrypts API keys at rest and restores the active provider", async () => {
    const store = new InspectableSettingsStore();
    const registry = new BotDecisionRegistry();
    const service = new LlmSettingsService(
      store,
      registry,
      "stable-test-encryption-secret",
    );
    await service.initialize();

    await service.update({
      enabled: true,
      model: "deepseek-v4-pro",
      apiKey: "sk-secret-value",
      thinkingEnabled: false,
      timeoutMs: 2_000,
      maximumOutputTokens: 12,
    }, "11111111-1111-4111-8111-111111111111");

    expect(registry.supports("doudizhu")).toBe(true);
    expect(JSON.stringify(store.loaded)).not.toContain("sk-secret-value");
    expect(store.loaded?.settings.encryptedApiKey).toMatchObject({
      algorithm: "aes-256-gcm",
    });
    expect(service.getPublicSettings()).not.toHaveProperty("apiKey");

    const restoredRegistry = new BotDecisionRegistry();
    const restored = new LlmSettingsService(
      store,
      restoredRegistry,
      "stable-test-encryption-secret",
    );
    await restored.initialize();
    expect(restored.getPublicSettings()).toMatchObject({
      enabled: true,
      model: "deepseek-v4-pro",
      apiKeyConfigured: true,
    });
    expect(restoredRegistry.supports("doudizhu")).toBe(true);
  });

  it("tests the selected DeepSeek model with the model-list endpoint and no inference call", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      object: "list",
      data: [
        { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
        { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const service = new LlmSettingsService(
      new InspectableSettingsStore(),
      new BotDecisionRegistry(),
      "stable-test-encryption-secret",
      undefined,
      fetcher,
    );
    await service.initialize();

    const result = await service.testConnection(
      "sk-unsaved-key",
      "deepseek-v4-pro",
    );

    expect(result).toMatchObject({
      ok: true,
      provider: "deepseek",
      model: "deepseek-v4-pro",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer sk-unsaved-key" },
      }),
    );
  });
});
