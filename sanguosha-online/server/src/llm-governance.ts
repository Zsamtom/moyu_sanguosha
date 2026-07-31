import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type LlmGovernedFeature = "homestead";

export type LlmAuditStatus =
  | "success"
  | "fallback"
  | "failure"
  | "skipped";

export type LlmGovernanceReason =
  | "daily_call_budget"
  | "daily_token_budget"
  | "circuit_open"
  | "governance_unavailable"
  | "timeout"
  | "http_error"
  | "network_error"
  | "empty_content"
  | "invalid_json"
  | "invalid_candidate"
  | "provider_unavailable"
  | "compile_rejected";

export interface LlmGovernancePolicy {
  readonly dailyCallLimitPerUser: number;
  readonly dailyTokenLimitPerUser: number;
  readonly circuitFailureThreshold: number;
  readonly circuitCooldownMs: number;
}

export const DEFAULT_LLM_GOVERNANCE_POLICY: LlmGovernancePolicy = {
  dailyCallLimitPerUser: 8,
  dailyTokenLimitPerUser: 40_000,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 5 * 60_000,
};

export interface LlmDecisionAuditEntry {
  readonly id: string;
  readonly userId: string | null;
  readonly feature: LlmGovernedFeature;
  readonly townId: string | null;
  readonly dayKey: string | null;
  readonly status: LlmAuditStatus;
  readonly failureReason: LlmGovernanceReason | null;
  readonly candidateCount: number;
  readonly selectedEventId: string | null;
  readonly eventInstanceId: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly latencyMs: number;
  readonly createdAt: string;
}

export interface LlmUsageTotals {
  readonly calls: number;
  readonly successes: number;
  readonly fallbacks: number;
  readonly failures: number;
  readonly skipped: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LlmGovernanceSnapshot {
  readonly policy: LlmGovernancePolicy;
  readonly rolling24Hours: LlmUsageTotals;
  readonly circuit: {
    readonly open: boolean;
    readonly retryAt: string | null;
    readonly consecutiveFailures: number;
  };
  readonly recent: readonly LlmDecisionAuditEntry[];
}

export interface LlmDecisionAuditInput {
  readonly userId: string;
  readonly feature: LlmGovernedFeature;
  readonly townId?: string;
  readonly dayKey?: string;
  readonly status: LlmAuditStatus;
  readonly failureReason?: LlmGovernanceReason;
  readonly candidateCount?: number;
  readonly selectedEventId?: string;
  readonly eventInstanceId?: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly latencyMs?: number;
}

export interface LlmGovernanceStore {
  record(entry: LlmDecisionAuditEntry): Promise<void>;
  getUserDayUsage(
    userId: string,
    feature: LlmGovernedFeature,
    dayKey: string,
  ): Promise<LlmUsageTotals>;
  summarizeSince(
    feature: LlmGovernedFeature,
    since: Date,
  ): Promise<LlmUsageTotals>;
  listRecent(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]>;
  listRecentProviderDecisions(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]>;
}

const EMPTY_USAGE: LlmUsageTotals = {
  calls: 0,
  successes: 0,
  fallbacks: 0,
  failures: 0,
  skipped: 0,
  promptTokens: 0,
  completionTokens: 0,
};

function clampNonNegativeInteger(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 0;
}

function isProviderFailure(entry: LlmDecisionAuditEntry): boolean {
  return entry.status === "failure" || entry.status === "fallback";
}

function usageFromEntries(
  entries: readonly LlmDecisionAuditEntry[],
): LlmUsageTotals {
  return entries.reduce<LlmUsageTotals>(
    (usage, entry) => ({
      calls: usage.calls +
        (entry.status === "success" ||
            entry.status === "fallback" ||
            entry.status === "failure"
          ? 1
          : 0),
      successes: usage.successes + (entry.status === "success" ? 1 : 0),
      fallbacks: usage.fallbacks + (entry.status === "fallback" ? 1 : 0),
      failures: usage.failures + (entry.status === "failure" ? 1 : 0),
      skipped: usage.skipped + (entry.status === "skipped" ? 1 : 0),
      promptTokens: usage.promptTokens + entry.promptTokens,
      completionTokens: usage.completionTokens + entry.completionTokens,
    }),
    EMPTY_USAGE,
  );
}

export class MemoryLlmGovernanceStore implements LlmGovernanceStore {
  readonly entries: LlmDecisionAuditEntry[] = [];

  async record(entry: LlmDecisionAuditEntry): Promise<void> {
    this.entries.push(structuredClone(entry));
  }

  async getUserDayUsage(
    userId: string,
    feature: LlmGovernedFeature,
    dayKey: string,
  ): Promise<LlmUsageTotals> {
    return usageFromEntries(
      this.entries.filter(
        (entry) =>
          entry.userId === userId &&
          entry.feature === feature &&
          entry.dayKey === dayKey,
      ),
    );
  }

  async summarizeSince(
    feature: LlmGovernedFeature,
    since: Date,
  ): Promise<LlmUsageTotals> {
    return usageFromEntries(
      this.entries.filter(
        (entry) =>
          entry.feature === feature &&
          Date.parse(entry.createdAt) >= since.getTime(),
      ),
    );
  }

  async listRecent(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]> {
    return this.entries
      .filter((entry) => entry.feature === feature)
      .slice()
      .sort((left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt)
      )
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }

  async listRecentProviderDecisions(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]> {
    return this.entries
      .filter(
        (entry) =>
          entry.feature === feature &&
          entry.status !== "skipped",
      )
      .slice()
      .sort((left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt)
      )
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }
}

export class PostgresLlmGovernanceStore implements LlmGovernanceStore {
  constructor(private readonly pool: Pool) {}

  async record(entry: LlmDecisionAuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_decision_audit (
         id, user_id, feature, town_id, day_key, status, failure_reason,
         candidate_count, selected_event_id, event_instance_id,
         prompt_tokens, completion_tokens, latency_ms, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        entry.id,
        entry.userId,
        entry.feature,
        entry.townId,
        entry.dayKey,
        entry.status,
        entry.failureReason,
        entry.candidateCount,
        entry.selectedEventId,
        entry.eventInstanceId,
        entry.promptTokens,
        entry.completionTokens,
        entry.latencyMs,
        entry.createdAt,
      ],
    );
  }

  async getUserDayUsage(
    userId: string,
    feature: LlmGovernedFeature,
    dayKey: string,
  ): Promise<LlmUsageTotals> {
    const result = await this.pool.query<{
      calls: string;
      successes: string;
      fallbacks: string;
      failures: string;
      skipped: string;
      prompt_tokens: string;
      completion_tokens: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('success', 'fallback', 'failure')) AS calls,
         COUNT(*) FILTER (WHERE status = 'success') AS successes,
         COUNT(*) FILTER (WHERE status = 'fallback') AS fallbacks,
         COUNT(*) FILTER (WHERE status = 'failure') AS failures,
         COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens
       FROM llm_decision_audit
       WHERE user_id = $1 AND feature = $2 AND day_key = $3`,
      [userId, feature, dayKey],
    );
    return this.mapUsage(result.rows[0]);
  }

  async summarizeSince(
    feature: LlmGovernedFeature,
    since: Date,
  ): Promise<LlmUsageTotals> {
    const result = await this.pool.query<{
      calls: string;
      successes: string;
      fallbacks: string;
      failures: string;
      skipped: string;
      prompt_tokens: string;
      completion_tokens: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('success', 'fallback', 'failure')) AS calls,
         COUNT(*) FILTER (WHERE status = 'success') AS successes,
         COUNT(*) FILTER (WHERE status = 'fallback') AS fallbacks,
         COUNT(*) FILTER (WHERE status = 'failure') AS failures,
         COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens
       FROM llm_decision_audit
       WHERE feature = $1 AND created_at >= $2`,
      [feature, since],
    );
    return this.mapUsage(result.rows[0]);
  }

  async listRecent(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]> {
    const result = await this.pool.query<{
      id: string;
      user_id: string | null;
      feature: LlmGovernedFeature;
      town_id: string | null;
      day_key: string | null;
      status: LlmAuditStatus;
      failure_reason: LlmGovernanceReason | null;
      candidate_count: number;
      selected_event_id: string | null;
      event_instance_id: string | null;
      prompt_tokens: number;
      completion_tokens: number;
      latency_ms: number;
      created_at: Date | string;
    }>(
      `SELECT
         id, user_id, feature, town_id, day_key, status, failure_reason,
         candidate_count, selected_event_id, event_instance_id,
         prompt_tokens, completion_tokens, latency_ms, created_at
       FROM llm_decision_audit
       WHERE feature = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [feature, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      feature: row.feature,
      townId: row.town_id,
      dayKey: row.day_key,
      status: row.status,
      failureReason: row.failure_reason,
      candidateCount: row.candidate_count,
      selectedEventId: row.selected_event_id,
      eventInstanceId: row.event_instance_id,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      latencyMs: row.latency_ms,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async listRecentProviderDecisions(
    feature: LlmGovernedFeature,
    limit: number,
  ): Promise<LlmDecisionAuditEntry[]> {
    const result = await this.pool.query<{
      id: string;
      user_id: string | null;
      feature: LlmGovernedFeature;
      town_id: string | null;
      day_key: string | null;
      status: LlmAuditStatus;
      failure_reason: LlmGovernanceReason | null;
      candidate_count: number;
      selected_event_id: string | null;
      event_instance_id: string | null;
      prompt_tokens: number;
      completion_tokens: number;
      latency_ms: number;
      created_at: Date | string;
    }>(
      `SELECT
         id, user_id, feature, town_id, day_key, status, failure_reason,
         candidate_count, selected_event_id, event_instance_id,
         prompt_tokens, completion_tokens, latency_ms, created_at
       FROM llm_decision_audit
       WHERE feature = $1 AND status <> 'skipped'
       ORDER BY created_at DESC
       LIMIT $2`,
      [feature, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      feature: row.feature,
      townId: row.town_id,
      dayKey: row.day_key,
      status: row.status,
      failureReason: row.failure_reason,
      candidateCount: row.candidate_count,
      selectedEventId: row.selected_event_id,
      eventInstanceId: row.event_instance_id,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      latencyMs: row.latency_ms,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  private mapUsage(
    row:
      | {
          calls: string;
          successes: string;
          fallbacks: string;
          failures: string;
          skipped: string;
          prompt_tokens: string;
          completion_tokens: string;
        }
      | undefined,
  ): LlmUsageTotals {
    if (!row) return EMPTY_USAGE;
    return {
      calls: Number(row.calls),
      successes: Number(row.successes),
      fallbacks: Number(row.fallbacks),
      failures: Number(row.failures),
      skipped: Number(row.skipped),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
    };
  }
}

export class LlmGovernanceService {
  private readonly inFlightCalls = new Map<string, number>();

  constructor(
    private readonly store: LlmGovernanceStore,
    readonly policy: LlmGovernancePolicy = DEFAULT_LLM_GOVERNANCE_POLICY,
    private readonly clock: () => number = Date.now,
  ) {}

  async authorize(input: {
    readonly userId: string;
    readonly feature: LlmGovernedFeature;
    readonly townId?: string;
    readonly dayKey: string;
  }): Promise<
    | { readonly allowed: true }
    | { readonly allowed: false; readonly reason: LlmGovernanceReason }
  > {
    try {
      const recent = await this.store.listRecentProviderDecisions(
        input.feature,
        this.policy.circuitFailureThreshold,
      );
      const circuit = this.circuitState(recent);
      if (circuit.open) {
        await this.record({
          ...input,
          status: "skipped",
          failureReason: "circuit_open",
        });
        return { allowed: false, reason: "circuit_open" };
      }

      const usage = await this.store.getUserDayUsage(
        input.userId,
        input.feature,
        input.dayKey,
      );
      const reservationKey = this.reservationKey(
        input.userId,
        input.feature,
        input.dayKey,
      );
      const reservedCalls = this.inFlightCalls.get(reservationKey) ?? 0;
      if (
        usage.calls + reservedCalls >=
          this.policy.dailyCallLimitPerUser
      ) {
        await this.record({
          ...input,
          status: "skipped",
          failureReason: "daily_call_budget",
        });
        return { allowed: false, reason: "daily_call_budget" };
      }
      if (
        usage.promptTokens + usage.completionTokens >=
          this.policy.dailyTokenLimitPerUser
      ) {
        await this.record({
          ...input,
          status: "skipped",
          failureReason: "daily_token_budget",
        });
        return { allowed: false, reason: "daily_token_budget" };
      }
      this.inFlightCalls.set(reservationKey, reservedCalls + 1);
      return { allowed: true };
    } catch (error) {
      console.error("LLM governance check failed; model call blocked", error);
      return { allowed: false, reason: "governance_unavailable" };
    }
  }

  async record(input: LlmDecisionAuditInput): Promise<void> {
    if (input.dayKey && input.status !== "skipped") {
      const reservationKey = this.reservationKey(
        input.userId,
        input.feature,
        input.dayKey,
      );
      const reservedCalls = this.inFlightCalls.get(reservationKey) ?? 0;
      if (reservedCalls <= 1) this.inFlightCalls.delete(reservationKey);
      else this.inFlightCalls.set(reservationKey, reservedCalls - 1);
    }
    const entry: LlmDecisionAuditEntry = {
      id: randomUUID(),
      userId: input.userId,
      feature: input.feature,
      townId: input.townId ?? null,
      dayKey: input.dayKey ?? null,
      status: input.status,
      failureReason: input.failureReason ?? null,
      candidateCount: clampNonNegativeInteger(input.candidateCount),
      selectedEventId: input.selectedEventId ?? null,
      eventInstanceId: input.eventInstanceId ?? null,
      promptTokens: clampNonNegativeInteger(input.promptTokens),
      completionTokens: clampNonNegativeInteger(input.completionTokens),
      latencyMs: clampNonNegativeInteger(input.latencyMs),
      createdAt: new Date(this.clock()).toISOString(),
    };
    try {
      await this.store.record(entry);
    } catch (error) {
      console.error("Failed to persist LLM decision audit", error);
    }
  }

  async snapshot(limit = 25): Promise<LlmGovernanceSnapshot> {
    const now = this.clock();
    const [rolling24Hours, recent, recentProviderDecisions] = await Promise.all([
      this.store.summarizeSince("homestead", new Date(now - 24 * 60 * 60_000)),
      this.store.listRecent("homestead", Math.max(
        limit,
        this.policy.circuitFailureThreshold,
      )),
      this.store.listRecentProviderDecisions(
        "homestead",
        this.policy.circuitFailureThreshold,
      ),
    ]);
    return {
      policy: this.policy,
      rolling24Hours,
      circuit: this.circuitState(recentProviderDecisions),
      recent: recent.slice(0, limit),
    };
  }

  private circuitState(
    recent: readonly LlmDecisionAuditEntry[],
  ): LlmGovernanceSnapshot["circuit"] {
    const providerDecisions = recent.filter(
      (entry) => entry.status !== "skipped",
    );
    const consecutiveFailures = providerDecisions
      .slice(0, this.policy.circuitFailureThreshold)
      .filter(isProviderFailure).length;
    const thresholdReached =
      consecutiveFailures >= this.policy.circuitFailureThreshold &&
      providerDecisions
        .slice(0, this.policy.circuitFailureThreshold)
        .every(isProviderFailure);
    const latestFailureAt = thresholdReached
      ? Date.parse(providerDecisions[0]!.createdAt)
      : 0;
    const retryAt = latestFailureAt + this.policy.circuitCooldownMs;
    const open = thresholdReached && retryAt > this.clock();
    return {
      open,
      retryAt: open ? new Date(retryAt).toISOString() : null,
      consecutiveFailures: thresholdReached
        ? consecutiveFailures
        : providerDecisions.findIndex((entry) => !isProviderFailure(entry)) === -1
          ? providerDecisions.filter(isProviderFailure).length
          : Math.max(
              0,
              providerDecisions.findIndex((entry) => !isProviderFailure(entry)),
            ),
    };
  }

  private reservationKey(
    userId: string,
    feature: LlmGovernedFeature,
    dayKey: string,
  ): string {
    return `${feature}:${userId}:${dayKey}`;
  }
}
