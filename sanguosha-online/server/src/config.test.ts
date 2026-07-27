import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const requiredEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused",
  SESSION_SECRET: "test-session-secret-at-least-32-characters",
  INITIAL_ADMIN_PASSWORD: "admin-password",
};

describe("build metadata configuration", () => {
  it("uses a safe development label and ignores an empty build SHA", () => {
    const config = loadConfig({ ...requiredEnvironment, BUILD_SHA: "" });

    expect(config.appVersion).toBe("dev");
    expect(config.buildSha).toBeUndefined();
  });

  it("normalizes configured release metadata", () => {
    const config = loadConfig({
      ...requiredEnvironment,
      APP_VERSION: " 2026.07.14 ",
      BUILD_SHA: " ABCDEF0123456789 ",
    });

    expect(config.appVersion).toBe("2026.07.14");
    expect(config.buildSha).toBe("ABCDEF0123456789");
  });

  it("rejects build identifiers that are not Git-style hexadecimal SHAs", () => {
    expect(() => loadConfig({ ...requiredEnvironment, BUILD_SHA: "not-a-sha" })).toThrow();
  });

  it("rejects release labels that are unsafe to bake into an image", () => {
    expect(() => loadConfig({ ...requiredEnvironment, APP_VERSION: "release with spaces" })).toThrow();
  });
});

describe("optional Dou Dizhu LLM bot configuration", () => {
  it("keeps the provider disabled when no credentials are configured", () => {
    expect(loadConfig(requiredEnvironment).doudizhuLlm).toBeUndefined();
  });

  it("loads a complete OpenAI-compatible provider configuration", () => {
    const config = loadConfig({
      ...requiredEnvironment,
      DOUDIZHU_LLM_ENDPOINT: "https://example.test/v1/chat/completions",
      DOUDIZHU_LLM_API_KEY: "secret",
      DOUDIZHU_LLM_MODEL: "small-model",
      DOUDIZHU_LLM_TIMEOUT_MS: "2500",
      DOUDIZHU_LLM_MAX_OUTPUT_TOKENS: "12",
    });

    expect(config.doudizhuLlm).toEqual({
      endpoint: "https://example.test/v1/chat/completions",
      apiKey: "secret",
      model: "small-model",
      timeoutMs: 2500,
      maximumOutputTokens: 12,
    });
  });

  it("rejects a partially configured provider", () => {
    expect(() => loadConfig({
      ...requiredEnvironment,
      DOUDIZHU_LLM_ENDPOINT: "https://example.test/v1/chat/completions",
    })).toThrow(/configured together/);
  });
});
