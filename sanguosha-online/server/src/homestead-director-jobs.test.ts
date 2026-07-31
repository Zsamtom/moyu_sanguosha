import { describe, expect, it } from "vitest";
import type { PublicUser } from "./users.js";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
import {
  MemoryHomesteadDirectorJobStore,
  type HomesteadDirectorJobInput,
} from "./homestead-director-jobs.js";
import { FarmService, MemoryFarmStateStore } from "./farm-service.js";

const now = Date.UTC(2026, 6, 31, 8, 0, 0);
const user: PublicUser = {
  id: "4e3b894b-4b7d-4ee7-b1ef-b996e58bdbac",
  username: "queue-farmer",
  displayName: "队列庄主",
  role: "player",
  disabled: false,
  mustChangePassword: false,
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
};

function queuedJob(): HomesteadDirectorJobInput {
  return {
    jobKey: "homestead:v1:test",
    userId: user.id,
    townId: "greenvale",
    dayKey: "2026-07-31",
    profile: {
      enabled: true,
      goal: "balanced",
      risk: "balanced",
      focus: "processing",
    },
    disasterId: null,
  };
}

describe("homestead director durable jobs", () => {
  it("deduplicates jobs and recovers an interrupted claim", async () => {
    const jobs = new MemoryHomesteadDirectorJobStore();
    const first = await jobs.enqueue(queuedJob());
    const duplicate = await jobs.enqueue(queuedJob());
    expect(duplicate.id).toBe(first.id);

    const interrupted = await jobs.claimNext();
    expect(interrupted).toMatchObject({
      id: first.id,
      status: "processing",
      attempts: 1,
    });
    expect(await jobs.recoverInterrupted()).toBe(1);

    const recovered = await jobs.claimNext();
    expect(recovered).toMatchObject({
      id: first.id,
      status: "processing",
      attempts: 2,
      lastError: "worker_restarted",
    });
    await jobs.complete(recovered!.id, "applied");

    const snapshot = await jobs.snapshot(10);
    expect(snapshot.counts).toEqual({
      pending: 0,
      processing: 0,
      applied: 1,
      obsolete: 0,
      failed: 0,
    });
    expect(snapshot.recent[0]).toMatchObject({
      status: "applied",
      attempts: 2,
    });
  });

  it("applies a queued whitelisted director decision to the saved estate", async () => {
    const state = new MemoryFarmStateStore();
    const jobs = new MemoryHomesteadDirectorJobStore();
    const decisions = new BotDecisionRegistry().register("homestead", {
      decide: async () => ({
        candidateIndex: 0,
        usage: {
          promptTokens: 120,
          completionTokens: 24,
        },
        presentation: {
          narrative: "商队依据今日库存提交了受规则约束的合作提案。",
          recommendation: "先比较两个固定选项的成本。",
          npcLine: "数值归规则，叙事交给我。",
          planStepIndices: [0, 1, 2],
        },
      }),
    });
    const service = new FarmService(
      state,
      decisions,
      () => now,
      undefined,
      undefined,
      jobs,
    );

    await service.getOrCreateHomestead(user);
    await service.runHomesteadDirectorJobs();

    const saved = await state.loadTownEstate(user.id, "greenvale") as {
      homestead: {
        worldEvent: {
          source: string;
          narrative: string;
          instanceId?: string;
        };
        statistics: {
          llmCalls: number;
          generatedEventsApplied: number;
        };
      };
    };
    expect(saved.homestead.worldEvent).toMatchObject({
      source: "llm",
      narrative: "商队依据今日库存提交了受规则约束的合作提案。",
    });
    expect(saved.homestead.worldEvent.instanceId).toMatch(
      /^generated:greenvale:/,
    );
    expect(saved.homestead.statistics).toMatchObject({
      llmCalls: 1,
      generatedEventsApplied: 1,
    });
    expect((await jobs.snapshot(10)).counts.applied).toBe(1);
  });
});
