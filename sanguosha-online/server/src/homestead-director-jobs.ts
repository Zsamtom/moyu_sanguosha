import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { HomesteadAiProfile } from "@sanguosha/shared";

export type HomesteadDirectorJobStatus =
  | "pending"
  | "processing"
  | "applied"
  | "obsolete"
  | "failed";

export interface HomesteadDirectorJobInput {
  readonly jobKey: string;
  readonly userId: string;
  readonly townId: string;
  readonly dayKey: string;
  readonly profile: HomesteadAiProfile;
  readonly disasterId: string | null;
}

export interface HomesteadDirectorJob extends HomesteadDirectorJobInput {
  readonly id: string;
  readonly status: HomesteadDirectorJobStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface HomesteadDirectorJobSnapshot {
  readonly counts: Record<HomesteadDirectorJobStatus, number>;
  readonly recent: readonly HomesteadDirectorJob[];
}

export interface HomesteadDirectorJobStore {
  enqueue(input: HomesteadDirectorJobInput): Promise<HomesteadDirectorJob>;
  recoverInterrupted(): Promise<number>;
  claimNext(): Promise<HomesteadDirectorJob | undefined>;
  complete(
    id: string,
    status: Extract<
      HomesteadDirectorJobStatus,
      "applied" | "obsolete" | "failed"
    >,
    error?: string,
  ): Promise<void>;
  snapshot(limit: number): Promise<HomesteadDirectorJobSnapshot>;
}

const EMPTY_COUNTS: Record<HomesteadDirectorJobStatus, number> = {
  pending: 0,
  processing: 0,
  applied: 0,
  obsolete: 0,
  failed: 0,
};

function cloneJob(job: HomesteadDirectorJob): HomesteadDirectorJob {
  return structuredClone(job);
}

function safeError(error: string | undefined): string | null {
  const normalized = error?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 500) : null;
}

export class MemoryHomesteadDirectorJobStore
implements HomesteadDirectorJobStore {
  private readonly jobs = new Map<string, HomesteadDirectorJob>();
  private readonly idsByKey = new Map<string, string>();

  async enqueue(
    input: HomesteadDirectorJobInput,
  ): Promise<HomesteadDirectorJob> {
    const existingId = this.idsByKey.get(input.jobKey);
    if (existingId) return cloneJob(this.jobs.get(existingId)!);
    const job: HomesteadDirectorJob = {
      ...structuredClone(input),
      id: randomUUID(),
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    this.jobs.set(job.id, job);
    this.idsByKey.set(job.jobKey, job.id);
    return cloneJob(job);
  }

  async recoverInterrupted(): Promise<number> {
    let recovered = 0;
    for (const [id, job] of this.jobs) {
      if (job.status !== "processing") continue;
      this.jobs.set(id, {
        ...job,
        status: "pending",
        startedAt: null,
        lastError: "worker_restarted",
      });
      recovered += 1;
    }
    return recovered;
  }

  async claimNext(): Promise<HomesteadDirectorJob | undefined> {
    const pending = [...this.jobs.values()]
      .filter((job) => job.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!pending) return undefined;
    const claimed: HomesteadDirectorJob = {
      ...pending,
      status: "processing",
      attempts: pending.attempts + 1,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.jobs.set(claimed.id, claimed);
    return cloneJob(claimed);
  }

  async complete(
    id: string,
    status: "applied" | "obsolete" | "failed",
    error?: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "processing") return;
    this.jobs.set(id, {
      ...job,
      status,
      lastError: safeError(error),
      completedAt: new Date().toISOString(),
    });
  }

  async snapshot(limit: number): Promise<HomesteadDirectorJobSnapshot> {
    const counts = { ...EMPTY_COUNTS };
    for (const job of this.jobs.values()) counts[job.status] += 1;
    return {
      counts,
      recent: [...this.jobs.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(cloneJob),
    };
  }
}

interface JobRow {
  readonly id: string;
  readonly job_key: string;
  readonly user_id: string;
  readonly town_id: string;
  readonly day_key: string;
  readonly profile: HomesteadAiProfile;
  readonly disaster_id: string | null;
  readonly status: HomesteadDirectorJobStatus;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly created_at: Date | string;
  readonly started_at: Date | string | null;
  readonly completed_at: Date | string | null;
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function mapRow(row: JobRow): HomesteadDirectorJob {
  return {
    id: row.id,
    jobKey: row.job_key,
    userId: row.user_id,
    townId: row.town_id,
    dayKey: row.day_key,
    profile: structuredClone(row.profile),
    disasterId: row.disaster_id,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: iso(row.created_at)!,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
  };
}

const JOB_COLUMNS = `
  id, job_key, user_id, town_id, day_key, profile, disaster_id,
  status, attempts, last_error, created_at, started_at, completed_at
`;
const JOB_RETURNING_COLUMNS = `
  job.id, job.job_key, job.user_id, job.town_id, job.day_key, job.profile,
  job.disaster_id, job.status, job.attempts, job.last_error, job.created_at,
  job.started_at, job.completed_at
`;

export class PostgresHomesteadDirectorJobStore
implements HomesteadDirectorJobStore {
  constructor(private readonly pool: Pool) {}

  async enqueue(
    input: HomesteadDirectorJobInput,
  ): Promise<HomesteadDirectorJob> {
    const result = await this.pool.query<JobRow>(
      `INSERT INTO homestead_director_job (
         id, job_key, user_id, town_id, day_key, profile, disaster_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (job_key) DO UPDATE SET job_key = EXCLUDED.job_key
       RETURNING ${JOB_COLUMNS}`,
      [
        randomUUID(),
        input.jobKey,
        input.userId,
        input.townId,
        input.dayKey,
        JSON.stringify(input.profile),
        input.disasterId,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async recoverInterrupted(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE homestead_director_job
       SET status = 'pending',
           started_at = NULL,
           last_error = 'worker_restarted'
       WHERE status = 'processing'`,
    );
    return result.rowCount ?? 0;
  }

  async claimNext(): Promise<HomesteadDirectorJob | undefined> {
    const result = await this.pool.query<JobRow>(
      `WITH candidate AS (
         SELECT id
         FROM homestead_director_job
         WHERE status = 'pending'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE homestead_director_job AS job
       SET status = 'processing',
           attempts = job.attempts + 1,
           started_at = NOW(),
           completed_at = NULL
       FROM candidate
       WHERE job.id = candidate.id
       RETURNING ${JOB_RETURNING_COLUMNS}`,
    );
    const row = result.rows[0];
    return row ? mapRow(row) : undefined;
  }

  async complete(
    id: string,
    status: "applied" | "obsolete" | "failed",
    error?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE homestead_director_job
       SET status = $2,
           last_error = $3,
           completed_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [id, status, safeError(error)],
    );
  }

  async snapshot(limit: number): Promise<HomesteadDirectorJobSnapshot> {
    const [countsResult, recentResult] = await Promise.all([
      this.pool.query<{ status: HomesteadDirectorJobStatus; count: string }>(
        `SELECT status, COUNT(*) AS count
         FROM homestead_director_job
         GROUP BY status`,
      ),
      this.pool.query<JobRow>(
        `SELECT ${JOB_COLUMNS}
         FROM homestead_director_job
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      ),
    ]);
    const counts = { ...EMPTY_COUNTS };
    for (const row of countsResult.rows) counts[row.status] = Number(row.count);
    return {
      counts,
      recent: recentResult.rows.map(mapRow),
    };
  }
}
