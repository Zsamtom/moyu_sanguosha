import { describe, expect, it } from "vitest";
import {
  LlmGovernanceService,
  MemoryLlmGovernanceStore,
  type LlmGovernancePolicy,
} from "./llm-governance.js";

const policy: LlmGovernancePolicy = {
  dailyCallLimitPerUser: 2,
  dailyTokenLimitPerUser: 100,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 1_000,
};

describe("LLM governance", () => {
  it("enforces persistent per-player call and token budgets", async () => {
    let now = Date.parse("2026-07-31T00:00:00.000Z");
    const store = new MemoryLlmGovernanceStore();
    const governance = new LlmGovernanceService(store, policy, () => now);
    const context = {
      userId: "player-1",
      feature: "homestead" as const,
      townId: "greenvale",
      dayKey: "2026-07-31",
    };

    expect(await governance.authorize(context)).toEqual({ allowed: true });
    await governance.record({
      ...context,
      status: "success",
      promptTokens: 30,
      completionTokens: 10,
    });
    await governance.record({
      ...context,
      status: "success",
      promptTokens: 40,
      completionTokens: 10,
    });
    expect(await governance.authorize(context)).toEqual({
      allowed: false,
      reason: "daily_call_budget",
    });

    now += 1_000;
    expect(
      await governance.authorize({ ...context, dayKey: "2026-08-01" }),
    ).toEqual({ allowed: true });

    await governance.record({
      ...context,
      userId: "player-2",
      status: "success",
      promptTokens: 90,
      completionTokens: 10,
    });
    expect(
      await governance.authorize({ ...context, userId: "player-2" }),
    ).toEqual({
      allowed: false,
      reason: "daily_token_budget",
    });
  });

  it("opens after consecutive failures and recovers after cooldown", async () => {
    let now = Date.parse("2026-07-31T01:00:00.000Z");
    const store = new MemoryLlmGovernanceStore();
    const governance = new LlmGovernanceService(
      store,
      { ...policy, dailyCallLimitPerUser: 10 },
      () => now,
    );
    const context = {
      userId: "player-1",
      feature: "homestead" as const,
      townId: "greenvale",
      dayKey: "2026-07-31",
    };

    for (const failureReason of [
      "timeout",
      "http_error",
      "invalid_json",
    ] as const) {
      await governance.record({
        ...context,
        status: "failure",
        failureReason,
      });
      now += 100;
    }

    expect(await governance.authorize(context)).toEqual({
      allowed: false,
      reason: "circuit_open",
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await governance.authorize(context)).toEqual({
        allowed: false,
        reason: "circuit_open",
      });
    }
    const openSnapshot = await governance.snapshot();
    expect(openSnapshot.circuit).toMatchObject({
      open: true,
      consecutiveFailures: 3,
    });
    expect(openSnapshot.rolling24Hours).toMatchObject({
      calls: 3,
      failures: 3,
      skipped: 6,
    });

    now += policy.circuitCooldownMs;
    expect(await governance.authorize(context)).toEqual({ allowed: true });
  });

  it("resets the consecutive failure count after a success", async () => {
    const store = new MemoryLlmGovernanceStore();
    const governance = new LlmGovernanceService(store, policy);
    const context = {
      userId: "player-1",
      feature: "homestead" as const,
      dayKey: "2026-07-31",
    };
    await governance.record({
      ...context,
      status: "failure",
      failureReason: "timeout",
    });
    await governance.record({ ...context, status: "success" });
    await governance.record({
      ...context,
      status: "failure",
      failureReason: "network_error",
    });

    const snapshot = await governance.snapshot();
    expect(snapshot.circuit.open).toBe(false);
    expect(snapshot.circuit.consecutiveFailures).toBe(1);
  });
});

  it("reserves in-flight calls so concurrent requests cannot exceed budget", async () => {
    const store = new MemoryLlmGovernanceStore();
    const governance = new LlmGovernanceService(store, {
      ...policy,
      dailyCallLimitPerUser: 1,
    });
    const context = {
      userId: "player-1",
      feature: "homestead" as const,
      dayKey: "2026-07-31",
    };

    expect(await governance.authorize(context)).toEqual({ allowed: true });
    expect(await governance.authorize(context)).toEqual({
      allowed: false,
      reason: "daily_call_budget",
    });
    expect(await governance.authorize(context)).toEqual({
      allowed: false,
      reason: "daily_call_budget",
    });

    await governance.record({ ...context, status: "success" });
    expect(await governance.authorize({ ...context, dayKey: "2026-08-01" }))
      .toEqual({ allowed: true });
  });
