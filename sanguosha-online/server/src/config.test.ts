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
