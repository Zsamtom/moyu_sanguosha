import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import type {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
} from "pg";
import {
  FARMING_STATE_VERSION,
  FarmingRuleError,
  applyFarmingAction,
  applyFarmingMarketDecision,
  applyFarmingVisitAction,
  assertRestorableFarmingGameState,
  createFarmingGame,
  getFarmingGameView,
  getFarmingNeighborSummary,
  migrateLegacyFarmGame,
  refreshFarmingGame,
  type FarmingAction,
  type FarmingGameState,
  type FarmingGameView,
  type FarmingNeighborSummary,
  type FarmingVisitAction,
  type FarmingVisitResult,
  type EstateProductionRule,
  RanchRuleError,
  RANCH_REQUIRED_FARM_LEVEL,
  applyRanchAction,
  applyRanchVisitAction,
  assertRestorableRanchGameState,
  createRanchGame,
  getRanchGameView,
  getRanchNeighborSummary,
  refreshRanchGame,
  type RanchAction,
  type RanchGameState,
  type RanchGameView,
  type RanchNeighborSummary,
  type RanchVisitAction,
  type RanchVisitResult,
  MineRuleError,
  applyMineAction,
  assertRestorableMineGameState,
  createMineGame,
  getMineGameView,
  type MineAction,
  type MineGameState,
  type MineGameView,
  HomesteadRuleError,
  applyHomesteadAction as applyHomesteadLinkedAction,
  applyHomesteadWorldEventDecision,
  compileHomesteadGeneratedEvent,
  assertRestorableHomesteadGameState,
  createHomesteadGame,
  getHomesteadGameView,
  getHomesteadProductionRules,
  refreshHomesteadGame,
  type HomesteadAction,
  type HomesteadGameState,
  type HomesteadGameView,
  type HomesteadLinkedEconomy,
  type HomesteadWorldEventId,
  assertRestorableEstateAccount,
  buyEstateMerchantItem,
  collectEstateShipment,
  consumeEstateMerchantItem,
  createEstateAccount,
  estateMerchantOfferIds,
  getEstateTownUnlockStatus,
  refreshEstateAccount,
  dispatchEstateShipment,
  spendEstateLogistics,
  travelEstateTown,
  unlockEstateTown,
  ESTATE_MERCHANT_ITEMS,
  ESTATE_CARGO_DEFINITIONS,
  HOMESTEAD_VALUE_ROUTES,
  HOMESTEAD_WORLD_EVENTS,
  type EstateAccountState,
  type EstateCargoDefinition,
  type EstateMerchantItemId,
  type EstateTownId,
  TOWN_DEFINITIONS,
  getTownRoute,
} from "@sanguosha/shared";
import {
  botDecisionFailureReason,
  type BotDecisionRegistry,
} from "./bots/decision-registry.js";
import { createFarmMarketDecision } from "./bots/farm-market-llm.js";
import {
  createHomesteadDirectorDecision,
  type HomesteadDirectorContext,
} from "./bots/homestead-director-llm.js";
import { HttpError } from "./errors.js";
import {
  createTownWeatherService,
  type TownWeatherService,
  type TownWeatherSnapshot,
} from "./town-weather.js";
import type { PublicUser } from "./users.js";
import type {
  LlmGovernanceReason,
  LlmGovernanceService,
} from "./llm-governance.js";
import type {
  HomesteadDirectorJob,
  HomesteadDirectorJobInput,
  HomesteadDirectorJobStore,
} from "./homestead-director-jobs.js";

export type FarmClientAction = FarmingAction;
export type FarmVisitClientAction = FarmingVisitAction;
export type RanchClientAction = RanchAction;
export type RanchVisitClientAction = RanchVisitAction;
export type MineClientAction = MineAction;
export type HomesteadClientAction = HomesteadAction;

export interface FarmSnapshot {
  readonly farm: FarmingGameView;
  readonly neighbors: FarmingNeighborSummary[];
  readonly marketDirectorAvailable: boolean;
}

export interface FarmActionSnapshot {
  readonly farm: FarmingGameView;
  readonly marketDirectorAvailable: boolean;
}

export interface FarmVisitSnapshot extends FarmSnapshot {
  readonly neighbor: FarmingGameView;
  readonly outcome: FarmingVisitResult["outcome"];
}

export interface RanchSnapshot {
  readonly ranch: RanchGameView;
  readonly neighbors: RanchNeighborSummary[];
}

export interface RanchActionSnapshot {
  readonly ranch: RanchGameView;
}

export interface RanchVisitSnapshot extends RanchSnapshot {
  readonly neighbor: RanchGameView;
  readonly outcome: RanchVisitResult["outcome"];
}

export interface MineSnapshot {
  readonly mine: MineGameView;
}

export interface HomesteadSnapshot {
  readonly homestead: HomesteadGameView;
}

export const TOWN_ESTATE_BUNDLE_VERSION = 1 as const;

export interface TownEstateBundle {
  readonly kind: "town_estate_bundle";
  readonly version: typeof TOWN_ESTATE_BUNDLE_VERSION;
  readonly townId: EstateTownId;
  readonly contentVersion: number;
  farm: FarmingGameState;
  ranch: RanchGameState;
  mine: MineGameState;
  homestead: HomesteadGameState;
}

export interface FarmStateStore {
  withUserLocks?<T>(
    userIds: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T>;
  load(userId: string): Promise<unknown | undefined>;
  list(limit: number): Promise<unknown[]>;
  save(userId: string, state: FarmingGameState): Promise<void>;
  savePair(
    firstUserId: string,
    firstState: FarmingGameState,
    secondUserId: string,
    secondState: FarmingGameState,
  ): Promise<void>;
  quarantine(userId: string, state: unknown, reason: string): Promise<void>;
  loadRanch(userId: string): Promise<unknown | undefined>;
  listRanches(limit: number): Promise<unknown[]>;
  saveRanch(userId: string, state: RanchGameState): Promise<void>;
  saveFarmAndRanch(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
  ): Promise<void>;
  saveRanchPair(
    firstUserId: string,
    firstState: RanchGameState,
    secondUserId: string,
    secondState: RanchGameState,
  ): Promise<void>;
  quarantineRanch(userId: string, state: unknown, reason: string): Promise<void>;
  loadMine(userId: string): Promise<unknown | undefined>;
  saveMine(userId: string, state: MineGameState): Promise<void>;
  saveHomestead(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
  ): Promise<void>;
  quarantineMine(userId: string, state: unknown, reason: string): Promise<void>;
  loadHomesteadState(userId: string): Promise<unknown | undefined>;
  saveHomesteadState(
    userId: string,
    state: HomesteadGameState,
  ): Promise<void>;
  saveEstate(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
    homestead: HomesteadGameState,
  ): Promise<void>;
  quarantineHomestead(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void>;
  loadEstateAccount(userId: string): Promise<unknown | undefined>;
  saveEstateAccount(userId: string, state: EstateAccountState): Promise<void>;
  loadTownEstate(
    userId: string,
    townId: EstateTownId,
  ): Promise<unknown | undefined>;
  listTownEstates(townId: EstateTownId, limit: number): Promise<unknown[]>;
  saveTownEstate(
    userId: string,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void>;
  saveAccountAndTownEstate(
    userId: string,
    account: EstateAccountState,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void>;
  saveTravelTransition(
    userId: string,
    account: EstateAccountState,
    fromTownId: EstateTownId,
    fromState: TownEstateBundle,
    toTownId: EstateTownId,
    toState: TownEstateBundle,
  ): Promise<void>;
  saveTownEstatePair(
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void>;
  saveAccountAndTownEstatePair(
    accountUserId: string,
    account: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void>;
  saveAccountsAndTownEstatePair(
    firstAccountUserId: string,
    firstAccount: EstateAccountState,
    secondAccountUserId: string,
    secondAccount: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void>;
  quarantineTownEstate(
    userId: string,
    townId: EstateTownId,
    state: unknown,
    reason: string,
  ): Promise<void>;
}

export class PostgresFarmStateStore implements FarmStateStore {
  private readonly lockClient = new AsyncLocalStorage<PoolClient>();

  constructor(private readonly pool: Pool) {}

  private query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const client = this.lockClient.getStore();
    return client
      ? client.query<Row>(text, values)
      : this.pool.query<Row>(text, values);
  }

  private async acquireClient(): Promise<{
    client: PoolClient;
    release: () => void;
  }> {
    const scopedClient = this.lockClient.getStore();
    if (scopedClient) {
      return {
        client: scopedClient,
        release: () => undefined,
      };
    }
    const freshClient = await this.pool.connect();
    return {
      client: freshClient,
      release: () => freshClient.release(),
    };
  }

  async withUserLocks<T>(
    userIds: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const inheritedClient = this.lockClient.getStore();
    const client = inheritedClient ?? await this.pool.connect();
    const lockKeys = [...new Set(userIds)]
      .sort()
      .map((userId) => `estate:${userId}`);
    const acquired: string[] = [];
    try {
      for (const lockKey of lockKeys) {
        await client.query(
          "SELECT pg_advisory_lock(hashtext($1))",
          [lockKey],
        );
        acquired.push(lockKey);
      }
      return inheritedClient
        ? await operation()
        : await this.lockClient.run(client, operation);
    } finally {
      for (const lockKey of acquired.reverse()) {
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtext($1))",
            [lockKey],
          );
        } catch {
          // Releasing the connection below also releases any remaining
          // session-level advisory locks.
        }
      }
      if (!inheritedClient) client.release();
    }
  }

  async load(userId: string): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      "SELECT state FROM farm_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async list(limit: number): Promise<unknown[]> {
    const result = await this.query<{ state: unknown }>(
      `SELECT state FROM farm_state
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.state);
  }

  async save(userId: string, state: FarmingGameState): Promise<void> {
    await this.query(
      `INSERT INTO farm_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }

  async savePair(
    firstUserId: string,
    firstState: FarmingGameState,
    secondUserId: string,
    secondState: FarmingGameState,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [userId, state] of [
        [firstUserId, firstState],
        [secondUserId, secondState],
      ] as const) {
        await client.query(
          `INSERT INTO farm_state (user_id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async quarantine(userId: string, state: unknown, reason: string): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO farm_state_quarantine (user_id, state, reason)
         VALUES ($1, $2::jsonb, $3)`,
        [userId, JSON.stringify(state), reason],
      );
      await client.query("DELETE FROM farm_state WHERE user_id = $1", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async loadRanch(userId: string): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      "SELECT state FROM ranch_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async listRanches(limit: number): Promise<unknown[]> {
    const result = await this.query<{ state: unknown }>(
      `SELECT state FROM ranch_state
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.state);
  }

  async saveRanch(userId: string, state: RanchGameState): Promise<void> {
    await this.query(
      `INSERT INTO ranch_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }

  async saveFarmAndRanch(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO farm_state (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [userId, JSON.stringify(farm)],
      );
      await client.query(
        `INSERT INTO ranch_state (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [userId, JSON.stringify(ranch)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async saveRanchPair(
    firstUserId: string,
    firstState: RanchGameState,
    secondUserId: string,
    secondState: RanchGameState,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [userId, state] of [
        [firstUserId, firstState],
        [secondUserId, secondState],
      ] as const) {
        await client.query(
          `INSERT INTO ranch_state (user_id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async quarantineRanch(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ranch_state_quarantine (user_id, state, reason)
         VALUES ($1, $2::jsonb, $3)`,
        [userId, JSON.stringify(state), reason],
      );
      await client.query("DELETE FROM ranch_state WHERE user_id = $1", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async loadMine(userId: string): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      "SELECT state FROM mine_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async saveMine(userId: string, state: MineGameState): Promise<void> {
    await this.query(
      `INSERT INTO mine_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }

  async saveHomestead(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [table, state] of [
        ["farm_state", farm],
        ["ranch_state", ranch],
        ["mine_state", mine],
      ] as const) {
        await client.query(
          `INSERT INTO ${table} (user_id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async quarantineMine(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO mine_state_quarantine (user_id, state, reason)
         VALUES ($1, $2::jsonb, $3)`,
        [userId, JSON.stringify(state), reason],
      );
      await client.query("DELETE FROM mine_state WHERE user_id = $1", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async loadHomesteadState(userId: string): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      "SELECT state FROM homestead_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async saveHomesteadState(
    userId: string,
    state: HomesteadGameState,
  ): Promise<void> {
    await this.query(
      `INSERT INTO homestead_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }

  async saveEstate(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
    homestead: HomesteadGameState,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [table, state] of [
        ["farm_state", farm],
        ["ranch_state", ranch],
        ["mine_state", mine],
        ["homestead_state", homestead],
      ] as const) {
        await client.query(
          `INSERT INTO ${table} (user_id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async quarantineHomestead(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO homestead_state_quarantine (user_id, state, reason)
         VALUES ($1, $2::jsonb, $3)`,
        [userId, JSON.stringify(state), reason],
      );
      await client.query(
        "DELETE FROM homestead_state WHERE user_id = $1",
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async loadEstateAccount(userId: string): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      "SELECT state FROM estate_account_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async saveEstateAccount(
    userId: string,
    state: EstateAccountState,
  ): Promise<void> {
    await this.query(
      `INSERT INTO estate_account_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }

  async loadTownEstate(
    userId: string,
    townId: EstateTownId,
  ): Promise<unknown | undefined> {
    const result = await this.query<{ state: unknown }>(
      `SELECT state FROM town_estate_state
       WHERE user_id = $1 AND town_id = $2`,
      [userId, townId],
    );
    return result.rows[0]?.state;
  }

  async listTownEstates(
    townId: EstateTownId,
    limit: number,
  ): Promise<unknown[]> {
    const result = await this.query<{ state: unknown }>(
      `SELECT state FROM town_estate_state
       WHERE town_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [townId, limit],
    );
    return result.rows.map((row) => row.state);
  }

  async saveTownEstate(
    userId: string,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void> {
    await this.query(
      `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, town_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, townId, JSON.stringify(state)],
    );
  }

  async saveAccountAndTownEstate(
    userId: string,
    account: EstateAccountState,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO estate_account_state (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [userId, JSON.stringify(account)],
      );
      await client.query(
        `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, town_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [userId, townId, JSON.stringify(state)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async saveTravelTransition(
    userId: string,
    account: EstateAccountState,
    fromTownId: EstateTownId,
    fromState: TownEstateBundle,
    toTownId: EstateTownId,
    toState: TownEstateBundle,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO estate_account_state (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [userId, JSON.stringify(account)],
      );
      for (const [townId, state] of [
        [fromTownId, fromState],
        [toTownId, toState],
      ] as const) {
        await client.query(
          `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (user_id, town_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, townId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async saveTownEstatePair(
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [userId, townId, state] of [
        [firstUserId, firstTownId, firstState],
        [secondUserId, secondTownId, secondState],
      ] as const) {
        await client.query(
          `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (user_id, town_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, townId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async saveAccountAndTownEstatePair(
    accountUserId: string,
    account: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO estate_account_state (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = NOW()`,
        [accountUserId, JSON.stringify(account)],
      );
      for (const [userId, townId, state] of [
        [firstUserId, firstTownId, firstState],
        [secondUserId, secondTownId, secondState],
      ] as const) {
        await client.query(
          `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (user_id, town_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, townId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async saveAccountsAndTownEstatePair(
    firstAccountUserId: string,
    firstAccount: EstateAccountState,
    secondAccountUserId: string,
    secondAccount: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const [userId, account] of [
        [firstAccountUserId, firstAccount],
        [secondAccountUserId, secondAccount],
      ] as const) {
        await client.query(
          `INSERT INTO estate_account_state (user_id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, JSON.stringify(account)],
        );
      }
      for (const [userId, townId, state] of [
        [firstUserId, firstTownId, firstState],
        [secondUserId, secondTownId, secondState],
      ] as const) {
        await client.query(
          `INSERT INTO town_estate_state (user_id, town_id, state, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (user_id, town_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = NOW()`,
          [userId, townId, JSON.stringify(state)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  async quarantineTownEstate(
    userId: string,
    townId: EstateTownId,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const { client, release } = await this.acquireClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO town_estate_state_quarantine
         (user_id, town_id, state, reason)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [userId, townId, JSON.stringify(state), reason],
      );
      await client.query(
        `DELETE FROM town_estate_state
         WHERE user_id = $1 AND town_id = $2`,
        [userId, townId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }
}

export class MemoryFarmStateStore implements FarmStateStore {
  private readonly states = new Map<string, unknown>();
  private readonly ranchStates = new Map<string, unknown>();
  private readonly mineStates = new Map<string, unknown>();
  private readonly homesteadStates = new Map<string, unknown>();
  private readonly estateAccounts = new Map<string, unknown>();
  private readonly townEstates = new Map<string, unknown>();
  readonly quarantined: Array<{ userId: string; state: unknown; reason: string }> = [];
  readonly quarantinedRanches: Array<{
    userId: string;
    state: unknown;
    reason: string;
  }> = [];
  readonly quarantinedMines: Array<{
    userId: string;
    state: unknown;
    reason: string;
  }> = [];
  readonly quarantinedHomesteads: Array<{
    userId: string;
    state: unknown;
    reason: string;
  }> = [];
  readonly quarantinedTownEstates: Array<{
    userId: string;
    townId: EstateTownId;
    state: unknown;
    reason: string;
  }> = [];

  async load(userId: string): Promise<unknown | undefined> {
    const state = this.states.get(userId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async list(limit: number): Promise<unknown[]> {
    return [...this.states.values()]
      .slice(-limit)
      .reverse()
      .map((state) => structuredClone(state));
  }

  async save(userId: string, state: FarmingGameState): Promise<void> {
    this.states.set(userId, structuredClone(state));
  }

  async savePair(
    firstUserId: string,
    firstState: FarmingGameState,
    secondUserId: string,
    secondState: FarmingGameState,
  ): Promise<void> {
    this.states.set(firstUserId, structuredClone(firstState));
    this.states.set(secondUserId, structuredClone(secondState));
  }

  async quarantine(userId: string, state: unknown, reason: string): Promise<void> {
    this.quarantined.push({
      userId,
      state: structuredClone(state),
      reason,
    });
    this.states.delete(userId);
  }

  setRaw(userId: string, state: unknown): void {
    this.states.set(userId, structuredClone(state));
  }

  async loadRanch(userId: string): Promise<unknown | undefined> {
    const state = this.ranchStates.get(userId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async listRanches(limit: number): Promise<unknown[]> {
    return [...this.ranchStates.values()]
      .slice(-limit)
      .reverse()
      .map((state) => structuredClone(state));
  }

  async saveRanch(userId: string, state: RanchGameState): Promise<void> {
    this.ranchStates.set(userId, structuredClone(state));
  }

  async saveFarmAndRanch(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
  ): Promise<void> {
    this.states.set(userId, structuredClone(farm));
    this.ranchStates.set(userId, structuredClone(ranch));
  }

  async saveRanchPair(
    firstUserId: string,
    firstState: RanchGameState,
    secondUserId: string,
    secondState: RanchGameState,
  ): Promise<void> {
    this.ranchStates.set(firstUserId, structuredClone(firstState));
    this.ranchStates.set(secondUserId, structuredClone(secondState));
  }

  async quarantineRanch(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    this.quarantinedRanches.push({
      userId,
      state: structuredClone(state),
      reason,
    });
    this.ranchStates.delete(userId);
  }

  setRawRanch(userId: string, state: unknown): void {
    this.ranchStates.set(userId, structuredClone(state));
  }

  async loadMine(userId: string): Promise<unknown | undefined> {
    const state = this.mineStates.get(userId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async saveMine(userId: string, state: MineGameState): Promise<void> {
    this.mineStates.set(userId, structuredClone(state));
  }

  async saveHomestead(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
  ): Promise<void> {
    this.states.set(userId, structuredClone(farm));
    this.ranchStates.set(userId, structuredClone(ranch));
    this.mineStates.set(userId, structuredClone(mine));
  }

  async quarantineMine(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    this.quarantinedMines.push({
      userId,
      state: structuredClone(state),
      reason,
    });
    this.mineStates.delete(userId);
  }

  setRawMine(userId: string, state: unknown): void {
    this.mineStates.set(userId, structuredClone(state));
  }

  async loadHomesteadState(userId: string): Promise<unknown | undefined> {
    const state = this.homesteadStates.get(userId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async saveHomesteadState(
    userId: string,
    state: HomesteadGameState,
  ): Promise<void> {
    this.homesteadStates.set(userId, structuredClone(state));
  }

  async saveEstate(
    userId: string,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
    homestead: HomesteadGameState,
  ): Promise<void> {
    this.states.set(userId, structuredClone(farm));
    this.ranchStates.set(userId, structuredClone(ranch));
    this.mineStates.set(userId, structuredClone(mine));
    this.homesteadStates.set(userId, structuredClone(homestead));
  }

  async quarantineHomestead(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    this.quarantinedHomesteads.push({
      userId,
      state: structuredClone(state),
      reason,
    });
    this.homesteadStates.delete(userId);
  }

  setRawHomestead(userId: string, state: unknown): void {
    this.homesteadStates.set(userId, structuredClone(state));
  }

  async loadEstateAccount(userId: string): Promise<unknown | undefined> {
    const state = this.estateAccounts.get(userId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async saveEstateAccount(
    userId: string,
    state: EstateAccountState,
  ): Promise<void> {
    this.estateAccounts.set(userId, structuredClone(state));
  }

  private townEstateKey(userId: string, townId: EstateTownId): string {
    return `${userId}:${townId}`;
  }

  async loadTownEstate(
    userId: string,
    townId: EstateTownId,
  ): Promise<unknown | undefined> {
    const state = this.townEstates.get(this.townEstateKey(userId, townId));
    return state === undefined ? undefined : structuredClone(state);
  }

  async listTownEstates(
    townId: EstateTownId,
    limit: number,
  ): Promise<unknown[]> {
    return [...this.townEstates.entries()]
      .filter(([key]) => key.endsWith(`:${townId}`))
      .slice(-limit)
      .reverse()
      .map(([, state]) => structuredClone(state));
  }

  async saveTownEstate(
    userId: string,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void> {
    this.townEstates.set(
      this.townEstateKey(userId, townId),
      structuredClone(state),
    );
  }

  async saveAccountAndTownEstate(
    userId: string,
    account: EstateAccountState,
    townId: EstateTownId,
    state: TownEstateBundle,
  ): Promise<void> {
    this.estateAccounts.set(userId, structuredClone(account));
    this.townEstates.set(
      this.townEstateKey(userId, townId),
      structuredClone(state),
    );
  }

  async saveTravelTransition(
    userId: string,
    account: EstateAccountState,
    fromTownId: EstateTownId,
    fromState: TownEstateBundle,
    toTownId: EstateTownId,
    toState: TownEstateBundle,
  ): Promise<void> {
    this.estateAccounts.set(userId, structuredClone(account));
    this.townEstates.set(
      this.townEstateKey(userId, fromTownId),
      structuredClone(fromState),
    );
    this.townEstates.set(
      this.townEstateKey(userId, toTownId),
      structuredClone(toState),
    );
  }

  async saveTownEstatePair(
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    this.townEstates.set(
      this.townEstateKey(firstUserId, firstTownId),
      structuredClone(firstState),
    );
    this.townEstates.set(
      this.townEstateKey(secondUserId, secondTownId),
      structuredClone(secondState),
    );
  }

  async saveAccountAndTownEstatePair(
    accountUserId: string,
    account: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    this.estateAccounts.set(accountUserId, structuredClone(account));
    await this.saveTownEstatePair(
      firstUserId,
      firstTownId,
      firstState,
      secondUserId,
      secondTownId,
      secondState,
    );
  }

  async saveAccountsAndTownEstatePair(
    firstAccountUserId: string,
    firstAccount: EstateAccountState,
    secondAccountUserId: string,
    secondAccount: EstateAccountState,
    firstUserId: string,
    firstTownId: EstateTownId,
    firstState: TownEstateBundle,
    secondUserId: string,
    secondTownId: EstateTownId,
    secondState: TownEstateBundle,
  ): Promise<void> {
    this.estateAccounts.set(firstAccountUserId, structuredClone(firstAccount));
    this.estateAccounts.set(secondAccountUserId, structuredClone(secondAccount));
    await this.saveTownEstatePair(
      firstUserId,
      firstTownId,
      firstState,
      secondUserId,
      secondTownId,
      secondState,
    );
  }

  async quarantineTownEstate(
    userId: string,
    townId: EstateTownId,
    state: unknown,
    reason: string,
  ): Promise<void> {
    this.quarantinedTownEstates.push({
      userId,
      townId,
      state: structuredClone(state),
      reason,
    });
    this.townEstates.delete(this.townEstateKey(userId, townId));
  }

  setRawEstateAccount(userId: string, state: unknown): void {
    this.estateAccounts.set(userId, structuredClone(state));
  }

  setRawTownEstate(
    userId: string,
    townId: EstateTownId,
    state: unknown,
  ): void {
    this.townEstates.set(
      this.townEstateKey(userId, townId),
      structuredClone(state),
    );
  }
}

export class FarmService {
  private readonly queues = new Map<string, Promise<void>>();
  private directorWorker: Promise<void> | null = null;
  private directorKickRequested = false;

  constructor(
    private readonly store: FarmStateStore,
    private readonly decisions: BotDecisionRegistry,
    private readonly clock: () => number = Date.now,
    private readonly townWeather: TownWeatherService =
      createTownWeatherService(),
    private readonly llmGovernance?: LlmGovernanceService,
    private readonly directorJobs?: HomesteadDirectorJobStore,
  ) {}

  get marketDirectorAvailable(): boolean {
    return this.decisions.supports("farm");
  }


  async resumeHomesteadDirectorJobs(): Promise<number> {
    if (!this.directorJobs) return 0;
    const recovered = await this.directorJobs.recoverInterrupted();
    await this.runHomesteadDirectorJobs();
    return recovered;
  }

  async runHomesteadDirectorJobs(): Promise<void> {
    if (!this.directorJobs) return;
    this.directorKickRequested = true;
    if (this.directorWorker) {
      await this.directorWorker;
      return;
    }
    const worker = this.drainHomesteadDirectorJobs();
    this.directorWorker = worker;
    try {
      await worker;
    } finally {
      if (this.directorWorker === worker) this.directorWorker = null;
    }
    if (this.directorKickRequested) {
      await this.runHomesteadDirectorJobs();
    }
  }
  async getOrCreate(user: PublicUser): Promise<FarmSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const { account, bundle } = await this.loadActiveEstate(user);
      return this.snapshot(
        bundle.farm,
        user.id,
        account.activeTownId,
        getHomesteadProductionRules(bundle.homestead).farm,
      );
    });
  }

  async applyAction(
    user: PublicUser,
    expectedRevision: number,
    action: FarmClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<FarmActionSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      let { account, bundle } = await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      const game = bundle.farm;
      this.assertRevision(game, expectedRevision);
      let next: FarmingGameState;
      try {
        next = applyFarmingAction(
          game,
          action,
          this.clock(),
          getHomesteadProductionRules(bundle.homestead).farm,
        );
      } catch (error) {
        this.mapRuleError(error);
      }
      bundle.farm = next!;
      account = this.syncAccountFromBundle(account, bundle);
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        account.activeTownId,
        bundle,
      );
      return {
        farm: getFarmingGameView(
          bundle.farm,
          user.id,
          this.clock(),
          getHomesteadProductionRules(bundle.homestead).farm,
        ),
        marketDirectorAvailable: this.marketDirectorAvailable,
      };
    });
  }

  async getNeighbors(user: PublicUser): Promise<FarmingNeighborSummary[]> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const account = await this.loadOrCreateEstateAccount(user);
      return this.neighborSummaries(user.id, account.activeTownId);
    });
  }

  async getNeighbor(
    user: PublicUser,
    neighborId: string,
  ): Promise<FarmingGameView> {
    if (neighborId === user.id) {
      throw new HttpError(400, "FARMING_CANNOT_VISIT_SELF", "不能访问自己的农场");
    }
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id, neighborId], async () => {
      const account = await this.loadOrCreateEstateAccount(user);
      const neighbor = await this.loadExistingTownEstate(
        neighborId,
        account.activeTownId,
      );
      return getFarmingGameView(neighbor.farm, user.id, this.clock());
    });
  }

  async applyVisitAction(
    user: PublicUser,
    neighborId: string,
    expectedRevision: number,
    expectedNeighborRevision: number,
    action: FarmVisitClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<FarmVisitSnapshot> {
    if (neighborId === user.id) {
      throw new HttpError(400, "FARMING_CANNOT_VISIT_SELF", "不能访问自己的农场");
    }
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id, neighborId], async () => {
      let { account, bundle: visitorBundle } =
        await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      let ownerBundle = await this.loadExistingTownEstate(
        neighborId,
        account.activeTownId,
      );
      let ownerAccount = await this.loadExistingEstateAccount(neighborId);
      const visitor = visitorBundle.farm;
      const owner = ownerBundle.farm;
      this.assertRevision(visitor, expectedRevision);
      if (owner.revision !== expectedNeighborRevision) {
        throw new HttpError(
          409,
          "FARMING_NEIGHBOR_REVISION_CONFLICT",
          "农友的田地状态已更新，请刷新后重试",
        );
      }
      let result: FarmingVisitResult;
      try {
        result = applyFarmingVisitAction(owner, visitor, action, this.clock());
      } catch (error) {
        this.mapRuleError(error);
      }
      visitorBundle.farm = result!.visitor;
      ownerBundle.farm = result!.owner;
      account = this.syncAccountFromBundle(account, visitorBundle);
      visitorBundle = this.syncBundleFromAccount(visitorBundle, account);
      ownerAccount = this.syncAccountFromBundle(ownerAccount, ownerBundle);
      ownerBundle = this.syncBundleFromAccount(ownerBundle, ownerAccount);
      await this.store.saveAccountsAndTownEstatePair(
        user.id,
        account,
        neighborId,
        ownerAccount,
        result!.owner.ownerId,
        account.activeTownId,
        ownerBundle,
        result!.visitor.ownerId,
        account.activeTownId,
        visitorBundle,
      );
      return {
        ...(await this.snapshot(
          result!.visitor,
          user.id,
          account.activeTownId,
          getHomesteadProductionRules(visitorBundle.homestead).farm,
        )),
        neighbor: getFarmingGameView(result!.owner, user.id, this.clock()),
        outcome: result!.outcome,
      };
    });
  }

  async getOrCreateRanch(user: PublicUser): Promise<RanchSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const { account, bundle } = await this.loadActiveEstate(user);
      return this.ranchSnapshot(
        bundle.ranch,
        bundle.farm,
        user.id,
        account.activeTownId,
        getHomesteadProductionRules(bundle.homestead).ranch,
      );
    });
  }

  async applyRanchAction(
    user: PublicUser,
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    action: RanchClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<RanchActionSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      let { account, bundle } = await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      const { farm, ranch } = bundle;
      this.assertRevision(farm, expectedFarmRevision);
      this.assertRanchRevision(ranch, expectedRanchRevision);
      let result: ReturnType<typeof applyRanchAction>;
      try {
        result = applyRanchAction(
          ranch,
          {
            farmRevision: farm.revision,
            farmLevel: farm.level,
            coins: farm.coins,
            produce: farm.produce,
          },
          action,
          this.clock(),
          getHomesteadProductionRules(bundle.homestead).ranch,
        );
      } catch (error) {
        this.mapRanchRuleError(error);
      }
      const nextFarm = structuredClone(farm);
      if (result!.economyChanged) {
        nextFarm.coins = result!.economy.coins;
        nextFarm.produce = structuredClone(result!.economy.produce);
        nextFarm.revision = result!.economy.farmRevision;
        nextFarm.updatedAt = Math.max(nextFarm.updatedAt, this.clock());
      }
      bundle.farm = nextFarm;
      bundle.ranch = result!.ranch;
      account = this.syncAccountFromBundle(account, bundle);
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        account.activeTownId,
        bundle,
      );
      return {
        ranch: this.ranchView(
          bundle.ranch,
          bundle.farm,
          user.id,
          getHomesteadProductionRules(bundle.homestead).ranch,
        ),
      };
    });
  }

  async getRanchNeighbors(user: PublicUser): Promise<RanchNeighborSummary[]> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const account = await this.loadOrCreateEstateAccount(user);
      return this.ranchNeighborSummaries(user.id, account.activeTownId);
    });
  }

  async getRanchNeighbor(
    user: PublicUser,
    neighborId: string,
  ): Promise<RanchGameView> {
    if (neighborId === user.id) {
      throw new HttpError(400, "RANCH_CANNOT_VISIT_SELF", "不能访问自己的牧场");
    }
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id, neighborId], async () => {
      const account = await this.loadOrCreateEstateAccount(user);
      const neighbor = await this.loadExistingTownEstate(
        neighborId,
        account.activeTownId,
      );
      return this.ranchView(neighbor.ranch, neighbor.farm, user.id);
    });
  }

  async applyRanchVisitAction(
    user: PublicUser,
    neighborId: string,
    expectedRanchRevision: number,
    expectedNeighborRevision: number,
    action: RanchVisitClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<RanchVisitSnapshot> {
    if (neighborId === user.id) {
      throw new HttpError(400, "RANCH_CANNOT_VISIT_SELF", "不能访问自己的牧场");
    }
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id, neighborId], async () => {
      let { account, bundle: visitorBundle } =
        await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      const visitorFarm = visitorBundle.farm;
      if (visitorFarm.level < RANCH_REQUIRED_FARM_LEVEL) {
        throw new HttpError(
          400,
          "RANCH_LOCKED",
          `农场达到 ${RANCH_REQUIRED_FARM_LEVEL} 级后开放牧场`,
        );
      }
      const visitor = visitorBundle.ranch;
      const ownerBundle = await this.loadExistingTownEstate(
        neighborId,
        account.activeTownId,
      );
      const owner = ownerBundle.ranch;
      const ownerFarm = ownerBundle.farm;
      this.assertRanchRevision(visitor, expectedRanchRevision);
      if (owner.revision !== expectedNeighborRevision) {
        throw new HttpError(
          409,
          "RANCH_NEIGHBOR_REVISION_CONFLICT",
          "农友的牧场状态已更新，请刷新后重试",
        );
      }
      let result: RanchVisitResult;
      try {
        result = applyRanchVisitAction(
          owner,
          visitor,
          action,
          ownerFarm.dogLevel,
          this.clock(),
        );
      } catch (error) {
        this.mapRanchRuleError(error);
      }
      visitorBundle.ranch = result!.visitor;
      ownerBundle.ranch = result!.owner;
      account = this.syncAccountFromBundle(account, visitorBundle);
      visitorBundle = this.syncBundleFromAccount(visitorBundle, account);
      await this.store.saveAccountAndTownEstatePair(
        user.id,
        account,
        result!.owner.ownerId,
        account.activeTownId,
        ownerBundle,
        result!.visitor.ownerId,
        account.activeTownId,
        visitorBundle,
      );
      return {
        ...(await this.ranchSnapshot(
          result!.visitor,
          visitorFarm,
          user.id,
          account.activeTownId,
          getHomesteadProductionRules(visitorBundle.homestead).ranch,
        )),
        neighbor: this.ranchView(result!.owner, ownerFarm, user.id),
        outcome: result!.outcome,
      };
    });
  }

  async getOrCreateMine(user: PublicUser): Promise<MineSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const { bundle } = await this.loadActiveEstate(user);
      return {
        mine: this.mineView(
          bundle.mine,
          bundle.farm,
          bundle.ranch,
          getHomesteadProductionRules(bundle.homestead).mine,
        ),
      };
    });
  }

  async applyMineAction(
    user: PublicUser,
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    expectedMineRevision: number,
    action: MineClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<MineSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      let { account, bundle } = await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      const { farm, ranch, mine } = bundle;
      this.assertRevision(farm, expectedFarmRevision);
      this.assertRanchRevision(ranch, expectedRanchRevision);
      this.assertMineRevision(mine, expectedMineRevision);
      let result: ReturnType<typeof applyMineAction>;
      try {
        result = applyMineAction(
          mine,
          {
            farmRevision: farm.revision,
            farmLevel: farm.level,
            coins: farm.coins,
            farmProduce: farm.produce,
            ranchRevision: ranch.revision,
            ranchLevel: ranch.level,
            ranchProducts: ranch.products,
          },
          action,
          this.clock(),
          getHomesteadProductionRules(bundle.homestead).mine,
        );
      } catch (error) {
        this.mapMineRuleError(error);
      }
      const nextFarm = structuredClone(farm);
      const nextRanch = structuredClone(ranch);
      if (result!.farmChanged) {
        nextFarm.coins = result!.economy.coins;
        nextFarm.revision = result!.economy.farmRevision;
        nextFarm.updatedAt = Math.max(nextFarm.updatedAt, this.clock());
      }
      if (result!.ranchChanged) {
        nextRanch.products = structuredClone(result!.economy.ranchProducts);
        nextRanch.revision = result!.economy.ranchRevision;
        nextRanch.updatedAt = Math.max(nextRanch.updatedAt, this.clock());
      }
      bundle.farm = nextFarm;
      bundle.ranch = nextRanch;
      bundle.mine = result!.mine;
      account = this.syncAccountFromBundle(account, bundle);
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        account.activeTownId,
        bundle,
      );
      return {
        mine: this.mineView(
          bundle.mine,
          bundle.farm,
          bundle.ranch,
          getHomesteadProductionRules(bundle.homestead).mine,
        ),
      };
    });
  }

  async getOrCreateHomestead(user: PublicUser): Promise<HomesteadSnapshot> {
    await this.prefetchTownWeather(user.id);
    return this.serializedMany([user.id], async () => {
      const { account, bundle } = await this.loadActiveEstate(user);
      this.scheduleHomesteadDirector(user, bundle);
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          this.clock(),
        ),
      };
    });
  }

  async applyHomesteadAction(
    user: PublicUser,
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    expectedMineRevision: number,
    expectedHomesteadRevision: number,
    expectedAccountRevisionOrAction:
      | number
      | HomesteadClientAction,
    maybeAction?: HomesteadClientAction,
    expectedTownId?: EstateTownId,
  ): Promise<HomesteadSnapshot> {
    const expectedAccountRevision =
      typeof expectedAccountRevisionOrAction === "number"
        ? expectedAccountRevisionOrAction
        : null;
    const action =
      typeof expectedAccountRevisionOrAction === "number"
        ? maybeAction
        : expectedAccountRevisionOrAction;
    if (!action) {
      throw new HttpError(
        400,
        "HOMESTEAD_INVALID_ACTION",
        "缺少庄园操作",
      );
    }
    await this.prefetchTownWeather(
      user.id,
      action.type === "homestead_switch_town" ||
        action.type === "homestead_unlock_town"
        ? action.townId
        : undefined,
    );
    return this.serializedMany([user.id], async () => {
      let { account, bundle } = await this.loadActiveEstate(user);
      this.assertExpectedTown(account.activeTownId, expectedTownId);
      const { farm, ranch, mine, homestead } = bundle;
      this.assertRevision(farm, expectedFarmRevision);
      this.assertRanchRevision(ranch, expectedRanchRevision);
      this.assertMineRevision(mine, expectedMineRevision);
      this.assertHomesteadRevision(homestead, expectedHomesteadRevision);
      if (
        expectedAccountRevision !== null &&
        account.revision !== expectedAccountRevision
      ) {
        throw new HttpError(
          409,
          "ESTATE_ACCOUNT_REVISION_CONFLICT",
          "庄园账户已在其他页面更新，请刷新后重试",
        );
      }

      const accountAction = await this.applyEstateAccountAction(
        user,
        account,
        bundle,
        action,
        this.clock(),
      );
      if (accountAction) return accountAction;

      let result: ReturnType<typeof applyHomesteadLinkedAction>;
      try {
        result = applyHomesteadLinkedAction(
          homestead,
          this.homesteadEconomy(farm, ranch, mine, account),
          action,
          this.clock(),
        );
      } catch (error) {
        this.mapHomesteadRuleError(error);
      }

      const nextFarm = structuredClone(farm);
      const nextRanch = structuredClone(ranch);
      const nextMine = structuredClone(mine);
      const now = this.clock();
      if (result!.farmChanged) {
        nextFarm.coins = result!.economy.coins;
        nextFarm.produce = structuredClone(result!.economy.farmProduce);
        nextFarm.revision = result!.economy.farmRevision;
        nextFarm.updatedAt = Math.max(nextFarm.updatedAt, now);
      }
      if (result!.ranchChanged) {
        nextRanch.products = structuredClone(result!.economy.ranchProducts);
        nextRanch.revision = result!.economy.ranchRevision;
        nextRanch.updatedAt = Math.max(nextRanch.updatedAt, now);
      }
      if (result!.mineChanged) {
        nextMine.ores = structuredClone(result!.economy.mineOres);
        nextMine.revision = result!.economy.mineRevision;
        nextMine.updatedAt = Math.max(nextMine.updatedAt, now);
      }

      bundle = {
        ...bundle,
        farm: nextFarm,
        ranch: nextRanch,
        mine: nextMine,
        homestead: result!.homestead,
      };
      account = this.syncAccountFromBundle(account, bundle);
      const logisticsCost = action.type === "homestead_complete_order"
        ? 2
        : action.type === "homestead_complete_value_route"
          ? HOMESTEAD_VALUE_ROUTES[action.routeId].stage >= 3 ? 2 : 1
          : action.type === "homestead_activate_emergency_boost"
            ? 1
            : 0;
      if (logisticsCost > 0) {
        try {
          account = spendEstateLogistics(
            account,
            logisticsCost,
            now,
          );
        } catch (error) {
          throw new HttpError(
            409,
            "ESTATE_LOGISTICS_INSUFFICIENT",
            error instanceof Error
              ? error.message
              : "今日物流容量不足",
          );
        }
      }
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        account.activeTownId,
        bundle,
      );
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          now,
        ),
      };
    });
  }

  private async applyEstateAccountAction(
    user: PublicUser,
    state: EstateAccountState,
    currentBundle: TownEstateBundle,
    action: HomesteadClientAction,
    now: number,
  ): Promise<HomesteadSnapshot | null> {
    if (action.type === "homestead_unlock_town") {
      let account: EstateAccountState;
      try {
        account = unlockEstateTown(state, action.townId, now);
      } catch (error) {
        throw new HttpError(
          400,
          "HOMESTEAD_TOWN_LOCKED",
          error instanceof Error ? error.message : String(error),
        );
      }
      let source = this.syncBundleFromAccount(currentBundle, account);
      let target = await this.loadOrCreateTownEstate(
        user,
        action.townId,
        account,
      );
      target.farm = refreshFarmingGame(target.farm, now);
      target.ranch = refreshRanchGame(target.ranch, now);
      target.homestead = refreshHomesteadGame(target.homestead, now);
      target = this.applyTownWeatherSnapshot(
        target,
        await this.townWeather.getTownWeather(action.townId, now),
      );
      source.homestead.revision += 1;
      source.homestead.updatedAt = Math.max(
        source.homestead.updatedAt,
        now,
      );
      source.homestead.logs.unshift({
        id: `${now}:town-unlock:${action.townId}`,
        at: now,
        type: "community",
        message:
          `${TOWN_DEFINITIONS[action.townId].name}开发许可已获批准，完整三业庄园档案已经建立。`,
      });
      target = this.syncBundleFromAccount(target, account);
      await this.store.saveTravelTransition(
        user.id,
        account,
        currentBundle.townId,
        source,
        action.townId,
        target,
      );
      return {
        homestead: getHomesteadGameView(
          source.homestead,
          this.homesteadEconomy(
            source.farm,
            source.ranch,
            source.mine,
            account,
          ),
          now,
        ),
      };
    }

    if (action.type === "homestead_switch_town") {
      if (this.homesteadLogisticsBlocked(currentBundle.homestead)) {
        throw new HttpError(
          400,
          "HOMESTEAD_TRAVEL_UNAVAILABLE",
          "当前城镇交通受持续灾害影响，请先处理本地物流事件",
        );
      }
      if (!state.townProgress[action.townId]?.unlocked) {
        const status = getEstateTownUnlockStatus(state, action.townId);
        throw new HttpError(
          400,
          "HOMESTEAD_TOWN_LOCKED",
          status.missing.join("；") || "目标城镇尚未解锁",
        );
      }
      const targetBeforeTravel = await this.loadOrCreateTownEstate(
        user,
        action.townId,
        state,
      );
      targetBeforeTravel.farm = refreshFarmingGame(
        targetBeforeTravel.farm,
        now,
      );
      targetBeforeTravel.ranch = refreshRanchGame(
        targetBeforeTravel.ranch,
        now,
      );
      targetBeforeTravel.homestead = refreshHomesteadGame(
        targetBeforeTravel.homestead,
        now,
      );
      let account: EstateAccountState;
      try {
        account = travelEstateTown(
          this.syncAccountFromBundle(state, targetBeforeTravel),
          action.townId,
          now,
        );
      } catch (error) {
        throw new HttpError(
          400,
          "HOMESTEAD_TRAVEL_UNAVAILABLE",
          error instanceof Error ? error.message : String(error),
        );
      }
      let source = this.syncBundleFromAccount(currentBundle, account);
      let target = this.syncBundleFromAccount(targetBeforeTravel, account);
      target = this.applyTownWeatherSnapshot(
        target,
        await this.townWeather.getTownWeather(action.townId, now),
      );
      source.homestead.logs.unshift({
        id: `${now}:town-depart:${action.townId}`,
        at: now,
        type: "community",
        message: `已乘坐${
          getTownRoute(currentBundle.townId, action.townId)?.name ?? "城际交通"
        }前往${TOWN_DEFINITIONS[action.townId].name}；原城镇生产继续按服务器时间运行。`,
      });
      target.homestead.logs.unshift({
        id: `${now}:town-arrive:${action.townId}`,
        at: now,
        type: "community",
        message: `抵达${TOWN_DEFINITIONS[action.townId].name}，当前页面和三业操作均已切换到本地庄园。`,
      });
      target.homestead.revision += 1;
      target.homestead.updatedAt = Math.max(
        target.homestead.updatedAt,
        now,
      );
      await this.store.saveTravelTransition(
        user.id,
        account,
        currentBundle.townId,
        source,
        action.townId,
        target,
      );
      return {
        homestead: getHomesteadGameView(
          target.homestead,
          this.homesteadEconomy(
            target.farm,
            target.ranch,
            target.mine,
            account,
          ),
          now,
        ),
      };
    }

    if (action.type === "homestead_dispatch_cargo") {
      const cargo = ESTATE_CARGO_DEFINITIONS[action.cargoId];
      if (!cargo) {
        throw new HttpError(400, "ESTATE_CARGO_UNKNOWN", "未知货运路线");
      }
      if (this.homesteadLogisticsBlocked(currentBundle.homestead)) {
        throw new HttpError(
          400,
          "ESTATE_CARGO_LOGISTICS_BLOCKED",
          "当前持续灾害正在阻断城镇货运，请先完成处置",
        );
      }
      if (
        cargo.requiredInfrastructureId &&
        ((
          currentBundle.homestead.infrastructure as unknown as
            Record<string, number>
        )[cargo.requiredInfrastructureId] ?? 0) <
          (cargo.requiredInfrastructureLevel ?? 1)
      ) {
        throw new HttpError(
          400,
          "ESTATE_CARGO_INFRASTRUCTURE_LOCKED",
          `高级货运需要对应本地基础设施达到 LV${cargo.requiredInfrastructureLevel ?? 1}`,
        );
      }
      const missing = cargo.manifest.filter(
        (resource) =>
          this.cargoResourceAvailable(currentBundle, resource) <
            resource.quantity,
      );
      if (missing.length > 0) {
        throw new HttpError(
          400,
          "ESTATE_CARGO_RESOURCES_INSUFFICIENT",
          `本地特色物资不足：${missing.map(({ itemId }) => itemId).join("、")}`,
        );
      }
      let account: EstateAccountState;
      try {
        account = dispatchEstateShipment(state, action.cargoId, now);
      } catch (error) {
        throw new HttpError(
          400,
          "ESTATE_CARGO_DISPATCH_REJECTED",
          error instanceof Error ? error.message : String(error),
        );
      }
      let bundle = structuredClone(currentBundle);
      this.deductCargoManifest(bundle, cargo, now);
      bundle.homestead.logs.unshift({
        id: `${now}:cargo-dispatch:${action.cargoId}`,
        at: now,
        type: "market",
        message:
          `${cargo.name}已经装车发往${TOWN_DEFINITIONS[cargo.toTownId].name}；原料已从本地三业仓库扣除。`,
      });
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        bundle.townId,
        bundle,
      );
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          now,
        ),
      };
    }

    if (action.type === "homestead_collect_cargo") {
      const shipment = state.shipments.find(
        ({ id }) => id === action.shipmentId,
      );
      if (!shipment) {
        throw new HttpError(404, "ESTATE_CARGO_NOT_FOUND", "货运记录不存在");
      }
      const cargo = ESTATE_CARGO_DEFINITIONS[shipment.cargoId];
      let account: EstateAccountState;
      try {
        account = collectEstateShipment(state, action.shipmentId, now);
      } catch (error) {
        throw new HttpError(
          400,
          "ESTATE_CARGO_COLLECTION_REJECTED",
          error instanceof Error ? error.message : String(error),
        );
      }
      let bundle = structuredClone(currentBundle);
      bundle.homestead.cargoInventory[cargo.id] += 1;
      bundle.homestead.statistics.cargoShipmentsCollected += 1;
      bundle.homestead.revision += 1;
      bundle.homestead.updatedAt = Math.max(
        bundle.homestead.updatedAt,
        now,
      );
      bundle.homestead.logs.unshift({
        id: `${now}:cargo-collect:${shipment.id}`,
        at: now,
        type: "market",
        message:
          `${cargo.name}已经进入跨城货栈；整箱物资现在可用于对应的城镇联动项目。`,
      });
      bundle = this.syncBundleFromAccount(bundle, account);
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        bundle.townId,
        bundle,
      );
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          now,
        ),
      };
    }

    if (action.type === "homestead_buy_merchant_item") {
      let account: EstateAccountState;
      const item = ESTATE_MERCHANT_ITEMS[action.itemId];
      try {
        account = buyEstateMerchantItem(state, action.itemId, now);
      } catch (error) {
        throw new HttpError(
          400,
          "HOMESTEAD_SHOP_PURCHASE_REJECTED",
          error instanceof Error ? error.message : String(error),
        );
      }
      let bundle = structuredClone(currentBundle);
      if (item.numericEffect.kind === "resource_bundle") {
        account = consumeEstateMerchantItem(account, action.itemId, now);
        const target = item.numericEffect.source === "farm"
          ? bundle.farm.produce as unknown as Record<string, number>
          : item.numericEffect.source === "ranch"
            ? bundle.ranch.products as unknown as Record<string, number>
            : item.numericEffect.source === "mine"
              ? bundle.mine.ores as unknown as Record<string, number>
              : bundle.homestead.goods as unknown as Record<string, number>;
        target[item.numericEffect.itemId] =
          (target[item.numericEffect.itemId] ?? 0) +
          item.numericEffect.quantity;
        if (item.numericEffect.source === "farm") {
          bundle.farm.revision += 1;
          bundle.farm.updatedAt = Math.max(bundle.farm.updatedAt, now);
        }
        if (item.numericEffect.source === "ranch") {
          bundle.ranch.revision += 1;
          bundle.ranch.updatedAt = Math.max(bundle.ranch.updatedAt, now);
        }
        if (item.numericEffect.source === "mine") {
          bundle.mine.revision += 1;
          bundle.mine.updatedAt = Math.max(bundle.mine.updatedAt, now);
        }
      }
      bundle = this.syncBundleFromAccount(bundle, account);
      bundle.homestead.revision += 1;
      bundle.homestead.updatedAt = Math.max(
        bundle.homestead.updatedAt,
        now,
      );
      bundle.homestead.logs.unshift({
        id: `${now}:merchant:${action.itemId}`,
        at: now,
        type: "market",
        message:
          `从今日商会供应中购入${item.name}。商品价格、效果和每日限购均由规则系统结算。`,
      });
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        bundle.townId,
        bundle,
      );
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          now,
        ),
      };
    }

    if (action.type === "homestead_use_acceleration_card") {
      const facility = currentBundle.homestead.facilities.find(
        ({ id }) => id === action.facilityId,
      );
      if (!facility?.job) {
        throw new HttpError(
          400,
          "HOMESTEAD_JOB_NOT_FOUND",
          "该设施没有可加速的加工任务",
        );
      }
      if (facility.job.completesAt <= now) {
        throw new HttpError(
          400,
          "HOMESTEAD_JOB_NOT_READY",
          "任务已经完成，无需使用加速券",
        );
      }
      if (facility.job.accelerated) {
        throw new HttpError(
          400,
          "HOMESTEAD_ACCELERATION_LIMIT",
          "每个加工任务最多使用一次优先调度券",
        );
      }
      let account: EstateAccountState;
      try {
        account = consumeEstateMerchantItem(
          state,
          "priority_dispatch",
          now,
        );
      } catch (error) {
        throw new HttpError(
          400,
          "HOMESTEAD_ACCELERATION_LIMIT",
          error instanceof Error ? error.message : String(error),
        );
      }
      const bundle = this.syncBundleFromAccount(currentBundle, account);
      const target = bundle.homestead.facilities.find(
        ({ id }) => id === action.facilityId,
      )!;
      const job = target.job!;
      const originalDuration = Math.max(
        0,
        job.completesAt - job.startedAt,
      );
      const maximumSaved = 30 * 60 * 1_000;
      const saved = Math.min(
        Math.floor(originalDuration * 0.1),
        maximumSaved,
      );
      target.job = {
        ...job,
        completesAt: Math.max(now + 60_000, job.completesAt - saved),
        accelerated: true,
      };
      bundle.homestead.revision += 1;
      bundle.homestead.updatedAt = Math.max(
        bundle.homestead.updatedAt,
        now,
      );
      bundle.homestead.logs.unshift({
        id: `${now}:acceleration:${action.facilityId}`,
        at: now,
        type: "production",
        message:
          `已使用优先调度券，加工任务节省 ${Math.floor(saved / 60_000)} 分钟；产量和天气快照不变。`,
      });
      await this.store.saveAccountAndTownEstate(
        user.id,
        account,
        bundle.townId,
        bundle,
      );
      return {
        homestead: getHomesteadGameView(
          bundle.homestead,
          this.homesteadEconomy(
            bundle.farm,
            bundle.ranch,
            bundle.mine,
            account,
          ),
          now,
        ),
      };
    }

    return null;
  }

  private cargoResourceAvailable(
    bundle: TownEstateBundle,
    resource: EstateCargoDefinition["manifest"][number],
  ): number {
    if (resource.source === "farm") {
      return (bundle.farm.produce as Record<string, number>)[resource.itemId] ?? 0;
    }
    if (resource.source === "ranch") {
      return (bundle.ranch.products as Record<string, number>)[resource.itemId] ?? 0;
    }
    if (resource.source === "mine") {
      return (bundle.mine.ores as Record<string, number>)[resource.itemId] ?? 0;
    }
    return (bundle.homestead.goods as Record<string, number>)[resource.itemId] ?? 0;
  }

  private deductCargoManifest(
    bundle: TownEstateBundle,
    cargo: EstateCargoDefinition,
    now: number,
  ): void {
    let farmChanged = false;
    let ranchChanged = false;
    let mineChanged = false;
    for (const resource of cargo.manifest) {
      if (resource.source === "farm") {
        const stock = bundle.farm.produce as Record<string, number>;
        stock[resource.itemId] = (stock[resource.itemId] ?? 0) - resource.quantity;
        farmChanged = true;
      } else if (resource.source === "ranch") {
        const stock = bundle.ranch.products as Record<string, number>;
        stock[resource.itemId] = (stock[resource.itemId] ?? 0) - resource.quantity;
        ranchChanged = true;
      } else if (resource.source === "mine") {
        const stock = bundle.mine.ores as Record<string, number>;
        stock[resource.itemId] = (stock[resource.itemId] ?? 0) - resource.quantity;
        mineChanged = true;
      } else {
        const stock = bundle.homestead.goods as Record<string, number>;
        stock[resource.itemId] = (stock[resource.itemId] ?? 0) - resource.quantity;
      }
    }
    if (farmChanged) {
      bundle.farm.revision += 1;
      bundle.farm.updatedAt = Math.max(bundle.farm.updatedAt, now);
    }
    if (ranchChanged) {
      bundle.ranch.revision += 1;
      bundle.ranch.updatedAt = Math.max(bundle.ranch.updatedAt, now);
    }
    if (mineChanged) {
      bundle.mine.revision += 1;
      bundle.mine.updatedAt = Math.max(bundle.mine.updatedAt, now);
    }
    bundle.homestead.revision += 1;
    bundle.homestead.updatedAt = Math.max(bundle.homestead.updatedAt, now);
  }

  private async prefetchTownWeather(
    userId: string,
    additionalTownId?: EstateTownId,
  ): Promise<void> {
    let activeTownId: EstateTownId = "greenvale";
    const loaded = await this.store.loadEstateAccount(userId);
    if (loaded !== undefined) {
      try {
        assertRestorableEstateAccount(loaded);
        activeTownId = loaded.activeTownId;
      } catch {
        // A recoverable account will be rebuilt inside the serialized section.
      }
    }
    const townIds = [...new Set([
      activeTownId,
      ...(additionalTownId ? [additionalTownId] : []),
    ])];
    await Promise.all(
      townIds.map((townId) =>
        this.townWeather.getTownWeather(townId, this.clock())
      ),
    );
  }

  private applyTownWeatherSnapshot(
    state: TownEstateBundle,
    snapshot: TownWeatherSnapshot,
  ): TownEstateBundle {
    const bundle = structuredClone(state);
    bundle.homestead.logs = bundle.homestead.logs.map((entry) => {
      if (!/^\d+:weather:(?:greenvale|frostpeak)$/.test(entry.id)) {
        return entry;
      }
      const condition = /实时天气：([^。]+)(?:。|$)/.exec(entry.message)?.[1];
      const message = entry.message.includes("最近可信实况")
        ? "实时天气暂时不可用，当前仅展示最近可信实况；本轮不应用天气或预警数值。"
        : entry.message.includes("未取得")
          ? "未取得可信实况，当前按中性安全规则运行，不应用天气或灾害倍率。"
          : `庄园气象站已同步实时天气${condition ? `：${condition}` : ""}。本轮效果冻结至下一个 8 小时窗口。`;
      return { ...entry, message };
    });
    const current = bundle.homestead.weather;
    const source = snapshot.source === "qweather"
      ? "live"
      : snapshot.source === "last_known_good"
        ? "last_known_good"
        : "fallback";
    const nextWeather: HomesteadGameState["weather"] = {
      weatherId: snapshot.weatherId,
      dayKey: bundle.homestead.dayKey,
      source,
      ...(snapshot.observation.observedAt !== null
        ? { observedAt: snapshot.observation.observedAt }
        : {}),
      validUntil: snapshot.validUntil,
      temperatureC: snapshot.observation.temperatureC,
      humidityPercent: snapshot.observation.humidityPercent,
      precipitationMm: snapshot.observation.precipitationMm,
      windKph: snapshot.observation.windSpeedKph,
      conditionText: snapshot.observation.conditionText,
      stale: snapshot.stale,
      mechanicsEnabled: snapshot.mechanicsEnabled,
      alertsAvailable: snapshot.alertsAvailable,
      forecastAvailable: snapshot.forecastAvailable ?? false,
      forecast: (snapshot.forecast ?? []).map((day) => ({
        ...structuredClone(day),
      })),
      fallbackReason: snapshot.fallbackReason,
      providerAttributions: [...snapshot.attributions],
      liveHazards: snapshot.disasters.map((hazard) => ({
        id: hazard.providerAlertId,
        name: hazard.eventName,
        headline: hazard.headline,
        severity: hazard.severity,
        affectsGameplay: hazard.affectsGameplay,
        mechanicId: hazard.mechanicId,
        expiresAt: hazard.expiresAt,
      })),
    };
    const weatherWindowChanged =
      current.validUntil !== nextWeather.validUntil ||
      current.source !== nextWeather.source ||
      current.mechanicsEnabled !== nextWeather.mechanicsEnabled ||
      current.alertsAvailable !== nextWeather.alertsAvailable ||
      current.forecastAvailable !== nextWeather.forecastAvailable ||
      current.weatherId !== nextWeather.weatherId;
    const hazardsChanged =
      JSON.stringify(current.liveHazards ?? []) !==
        JSON.stringify(nextWeather.liveHazards ?? []);
    const forecastChanged = JSON.stringify(current.forecast ?? []) !==
      JSON.stringify(nextWeather.forecast ?? []);
    if (!weatherWindowChanged && !hazardsChanged && !forecastChanged) {
      return bundle;
    }
    bundle.homestead.weather = nextWeather;
    if (snapshot.mechanicsEnabled) {
      const activeDisaster = bundle.homestead.disaster;
      const matchingActiveAlert = activeDisaster?.providerAlertId
        ? snapshot.disasters.find(
            (hazard) =>
              hazard.affectsGameplay &&
              hazard.mechanicId !== null &&
              hazard.providerAlertId === activeDisaster.providerAlertId,
          )
        : undefined;
      const unavailableAlertIds = new Set(
        bundle.homestead.handledWeatherAlertIds,
      );
      if (activeDisaster?.mitigated && activeDisaster.providerAlertId) {
        unavailableAlertIds.add(activeDisaster.providerAlertId);
      }
      const nextUnhandledAlert = snapshot.disasters.find(
        (hazard) =>
          hazard.affectsGameplay &&
          hazard.mechanicId !== null &&
          !unavailableAlertIds.has(hazard.providerAlertId),
      );
      if (
        matchingActiveAlert &&
        activeDisaster &&
        !activeDisaster.mitigated
      ) {
        activeDisaster.severity = Math.max(
          activeDisaster.severity,
          matchingActiveAlert.severity,
        );
        activeDisaster.remainingDays = Math.max(
          1,
          activeDisaster.remainingDays,
        );
        bundle.homestead.worldEvent.severity = activeDisaster.severity;
      } else if (
        nextUnhandledAlert &&
        (!activeDisaster || activeDisaster.mitigated)
      ) {
        const contentEventId = this.weatherDisasterContentEvent(
          bundle.townId,
          nextUnhandledAlert.mechanicId!,
          `${nextUnhandledAlert.eventName} ${nextUnhandledAlert.headline}`,
        );
        bundle.homestead.disaster = {
          eventId: nextUnhandledAlert.mechanicId!,
          ...(contentEventId !== nextUnhandledAlert.mechanicId
            ? { contentEventId }
            : {}),
          providerAlertId: nextUnhandledAlert.providerAlertId,
          startedDayKey: bundle.homestead.dayKey,
          remainingDays: 1,
          unresolvedDays: 0,
          severity: nextUnhandledAlert.severity,
          mitigated: false,
          resolution: null,
        };
        bundle.homestead.worldEvent = {
          ...bundle.homestead.worldEvent,
          eventId: contentEventId,
          dayKey: bundle.homestead.dayKey,
          selectedOptionId: null,
          narrative: nextUnhandledAlert.headline,
          source: "rules",
          startedDayKey: bundle.homestead.dayKey,
          durationDays: 1,
          unresolvedDays: 0,
          severity: nextUnhandledAlert.severity,
        };
        bundle.homestead.emergencyBoosts = {
          farm: false,
          ranch: false,
          mine: false,
        };
      }
    }
    bundle.homestead.revision += 1;
    bundle.homestead.updatedAt = Math.max(
      bundle.homestead.updatedAt,
      snapshot.fetchedAt,
      this.clock(),
    );
    if (weatherWindowChanged) {
      while (bundle.homestead.logs.some(
        ({ id }) => id === `homestead:${bundle.homestead.nextLogId}`,
      )) {
        bundle.homestead.nextLogId += 1;
      }
      bundle.homestead.logs.unshift({
        id: `homestead:${bundle.homestead.nextLogId}`,
        at: snapshot.fetchedAt,
        type: "event",
        message: snapshot.source === "qweather"
          ? `庄园气象站已同步实时天气：${snapshot.observation.conditionText}。本轮效果冻结至下一个 8 小时窗口。`
          : snapshot.source === "last_known_good"
            ? "实时天气暂时不可用，当前仅展示最近可信实况；本轮不应用天气或预警数值。"
            : "未取得可信实况，当前按中性安全规则运行，不应用天气或灾害倍率。",
      });
      bundle.homestead.nextLogId += 1;
    }
    return bundle;
  }

  private weatherDisasterContentEvent(
    townId: EstateTownId,
    mechanicId:
      | "mountain_seepage"
      | "cold_snap"
      | "heatwave"
      | "windstorm"
      | "hail"
      | "drought",
    description: string,
  ): HomesteadWorldEventId {
    if (townId === "greenvale") {
      if (
        mechanicId === "cold_snap" &&
        /管|供水|结冰|冰冻|pipe|water/i.test(description)
      ) {
        return "greenvale_pipe_freeze";
      }
      return mechanicId;
    }
    if (/雪崩|avalanche/i.test(description)) return "frost_avalanche";
    if (/道路结冰|轨道结冰|road icing|rail icing/i.test(description)) {
      return "frost_rail_icing";
    }
    if (mechanicId === "drought") {
      return "frost_highland_drought";
    }
    if (
      mechanicId === "mountain_seepage" ||
      mechanicId === "heatwave"
    ) {
      return "frost_spring_thaw";
    }
    return "frost_whiteout_damage";
  }

  private homesteadLogisticsBlocked(game: HomesteadGameState): boolean {
    if (!game.disaster || game.disaster.mitigated) return false;
    const event = HOMESTEAD_WORLD_EVENTS[
      game.disaster.contentEventId ?? game.disaster.eventId
    ];
    return event.hazard?.affectedSectors.includes("logistics") ?? false;
  }

  private async loadActiveEstate(user: PublicUser): Promise<{
    account: EstateAccountState;
    bundle: TownEstateBundle;
  }> {
    const now = this.clock();
    let account = await this.loadOrCreateEstateAccount(user);
    let bundle = await this.loadOrCreateTownEstate(
      user,
      account.activeTownId,
      account,
    );
    bundle = this.syncBundleFromAccount(bundle, account);

    const previousMarketDay = bundle.farm.marketDay;
    bundle.farm = refreshFarmingGame(bundle.farm, now);
    if (bundle.farm.marketDay !== previousMarketDay) {
      bundle.farm = await this.applyMarketDirector(bundle.farm, user.id);
    }
    bundle.ranch = refreshRanchGame(bundle.ranch, now);

    const previousHomesteadDay = bundle.homestead.dayKey;
    const refreshedHomestead = refreshHomesteadGame(
      bundle.homestead,
      now,
    );
    const dayChanged = refreshedHomestead.dayKey !== previousHomesteadDay;
    bundle.homestead = refreshedHomestead;
    const weather = await this.townWeather.getTownWeather(
      account.activeTownId,
      now,
    );
    bundle = this.applyTownWeatherSnapshot(bundle, weather);
    account = this.syncAccountFromBundle(account, bundle);
    bundle = this.syncBundleFromAccount(bundle, account);
    await this.store.saveAccountAndTownEstate(
      user.id,
      account,
      account.activeTownId,
      bundle,
    );
    if (dayChanged) {
      this.scheduleHomesteadDirector(user, bundle);
    }
    return { account, bundle };
  }

  private scheduleHomesteadDirector(
    user: PublicUser,
    bundle: TownEstateBundle,
    refreshKey = "daily",
  ): void {
    if (!this.decisions.supports("homestead")) {
      return;
    }
    if (
      refreshKey === "daily" &&
      bundle.homestead.advice.source === "llm" &&
      bundle.homestead.advice.dayKey === bundle.homestead.dayKey
    ) {
      return;
    }
    const continuingGeneratedEvent =
      bundle.homestead.worldEvent.source === "llm" &&
      bundle.homestead.worldEvent.rulesVersion === 2 &&
      bundle.homestead.worldEvent.parameters?.pacingId ===
        "two_day_follow_up" &&
      bundle.homestead.worldEvent.startedDayKey !==
        bundle.homestead.worldEvent.dayKey &&
      bundle.homestead.worldEvent.selectedOptionId === null;
    if (continuingGeneratedEvent) {
      return;
    }
    const profile = structuredClone(bundle.homestead.aiProfile);
    const disasterId =
      bundle.homestead.disaster?.contentEventId ??
      bundle.homestead.disaster?.eventId ??
      null;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([
        user.id,
        bundle.townId,
        bundle.homestead.dayKey,
        profile,
        disasterId,
        refreshKey,
      ]))
      .digest("hex")
      .slice(0, 32);
    const job: HomesteadDirectorJobInput = {
      jobKey: `homestead:v2:${fingerprint}`,
      userId: user.id,
      townId: bundle.townId,
      dayKey: bundle.homestead.dayKey,
      profile,
      disasterId,
    };
    const operation = this.directorJobs
      ? this.directorJobs.enqueue(job)
        .then(() => this.runHomesteadDirectorJobs())
      : this.executeHomesteadDirectorJob(job).then(() => undefined);
    void operation.catch((error) => {
      console.error(
        "Homestead director background update failed; rules remain active",
        error,
      );
    });
  }

  private async drainHomesteadDirectorJobs(): Promise<void> {
    if (!this.directorJobs) return;
    do {
      this.directorKickRequested = false;
      let job: HomesteadDirectorJob | undefined;
      while ((job = await this.directorJobs.claimNext())) {
        try {
          const status = await this.executeHomesteadDirectorJob(job);
          await this.directorJobs.complete(job.id, status);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          await this.directorJobs.complete(job.id, "failed", message);
          console.error(
            "Homestead director queued job failed; rules remain active",
            error,
          );
        }
      }
    } while (this.directorKickRequested);
  }

  private async executeHomesteadDirectorJob(
    job: HomesteadDirectorJobInput,
  ): Promise<"applied" | "obsolete"> {
    const prepared = await this.serializedMany(
      [job.userId],
      async (): Promise<{
        account: EstateAccountState;
        bundle: TownEstateBundle;
        baseRevision: number;
      } | null> => {
        const loadedAccount = await this.store.loadEstateAccount(job.userId);
        const loadedBundle = await this.store.loadTownEstate(
          job.userId,
          job.townId as EstateTownId,
        );
        if (loadedAccount === undefined || loadedBundle === undefined) {
          return null;
        }
        try {
          assertRestorableEstateAccount(loadedAccount);
          this.assertTownEstateBundle(
            loadedBundle,
            job.userId,
            job.townId as EstateTownId,
          );
        } catch {
          return null;
        }
        if (!this.directorJobMatches(job, loadedAccount, loadedBundle)) {
          return null;
        }
        return {
          account: structuredClone(loadedAccount),
          bundle: structuredClone(loadedBundle),
          baseRevision: loadedBundle.homestead.revision,
        };
      },
    );
    if (!prepared) return "obsolete";

    const directed = await this.applyHomesteadDirector(
      structuredClone(prepared.bundle.homestead),
      structuredClone(prepared.bundle.farm),
      structuredClone(prepared.bundle.ranch),
      structuredClone(prepared.bundle.mine),
      job.userId,
      this.homesteadDirectorContext(prepared.account, prepared.bundle),
    );
    if (directed.revision === prepared.baseRevision) return "obsolete";

    const applied = await this.serializedMany([job.userId], async () => {
      const loadedAccount = await this.store.loadEstateAccount(job.userId);
      const loadedBundle = await this.store.loadTownEstate(
        job.userId,
        job.townId as EstateTownId,
      );
      if (loadedAccount === undefined || loadedBundle === undefined) {
        return false;
      }
      try {
        assertRestorableEstateAccount(loadedAccount);
        this.assertTownEstateBundle(
          loadedBundle,
          job.userId,
          job.townId as EstateTownId,
        );
      } catch {
        return false;
      }
      if (!this.directorJobMatches(job, loadedAccount, loadedBundle)) {
        return false;
      }
      if (loadedBundle.homestead.revision !== prepared.baseRevision) {
        // A director response is semantically tied to the exact state it saw.
        // Never merge it onto newer player actions; the newer action schedules
        // its own refresh with fresh evidence instead.
        return false;
      }
      const nextBundle = structuredClone(loadedBundle);
      nextBundle.homestead = directed;
      const nextAccount = this.syncAccountFromBundle(
        structuredClone(loadedAccount),
        nextBundle,
      );
      await this.store.saveAccountAndTownEstate(
        job.userId,
        nextAccount,
        job.townId as EstateTownId,
        this.syncBundleFromAccount(nextBundle, nextAccount),
      );
      return true;
    });
    return applied ? "applied" : "obsolete";
  }

  private directorJobMatches(
    job: HomesteadDirectorJobInput,
    account: EstateAccountState,
    bundle: TownEstateBundle,
  ): boolean {
    const disasterId =
      bundle.homestead.disaster?.contentEventId ??
      bundle.homestead.disaster?.eventId ??
      null;
    return (
      account.activeTownId === job.townId &&
      bundle.townId === job.townId &&
      bundle.homestead.dayKey === job.dayKey &&
      JSON.stringify(bundle.homestead.aiProfile) ===
        JSON.stringify(job.profile) &&
      disasterId === job.disasterId
    );
  }

  private async loadOrCreateEstateAccount(
    user: PublicUser,
  ): Promise<EstateAccountState> {
    const loaded = await this.store.loadEstateAccount(user.id);
    if (loaded !== undefined) {
      try {
        assertRestorableEstateAccount(loaded);
        const original = structuredClone(loaded);
        let account = refreshEstateAccount(original, this.clock());
        let changed = account.revision !== original.revision;
        if (account.ownerName !== user.displayName) {
          account.ownerName = user.displayName;
          account.revision += 1;
          account.updatedAt = Math.max(account.updatedAt, this.clock());
          changed = true;
        }
        if (changed) await this.store.saveEstateAccount(user.id, account);
        return account;
      } catch (error) {
        console.error(
          `Invalid estate account for user ${user.id}; rebuilding account`,
          error,
        );
      }
    }

    let legacyFarm: FarmingGameState | undefined;
    let legacyRanch: RanchGameState | undefined;
    let legacyMine: MineGameState | undefined;
    let legacyHomestead: HomesteadGameState | undefined;
    const recoveredTownBundles: Partial<
      Record<EstateTownId, TownEstateBundle>
    > = {};
    const [
      rawFarm,
      rawRanch,
      rawMine,
      rawHomestead,
      rawGreenvaleBundle,
      rawFrostpeakBundle,
    ] = await Promise.all([
      this.store.load(user.id),
      this.store.loadRanch(user.id),
      this.store.loadMine(user.id),
      this.store.loadHomesteadState(user.id),
      this.store.loadTownEstate(user.id, "greenvale"),
      this.store.loadTownEstate(user.id, "frostpeak"),
    ]);
    try {
      if (rawFarm !== undefined) {
        assertRestorableFarmingGameState(rawFarm);
        legacyFarm = structuredClone(rawFarm);
      }
    } catch {
      // The legacy recovery path remains available when the town is loaded.
    }
    try {
      if (rawRanch !== undefined) {
        assertRestorableRanchGameState(rawRanch);
        legacyRanch = structuredClone(rawRanch);
      }
    } catch {
      // Ignore an invalid legacy projection here.
    }
    try {
      if (rawMine !== undefined) {
        assertRestorableMineGameState(rawMine);
        legacyMine = structuredClone(rawMine);
      }
    } catch {
      // Ignore an invalid legacy projection here.
    }
    try {
      if (rawHomestead !== undefined) {
        assertRestorableHomesteadGameState(rawHomestead);
        legacyHomestead = structuredClone(rawHomestead);
      }
    } catch {
      // Ignore an invalid legacy projection here.
    }
    for (const [townId, rawBundle] of [
      ["greenvale", rawGreenvaleBundle],
      ["frostpeak", rawFrostpeakBundle],
    ] as const) {
      if (rawBundle === undefined) continue;
      try {
        this.assertTownEstateBundle(rawBundle, user.id, townId);
        recoveredTownBundles[townId] = structuredClone(rawBundle);
      } catch (error) {
        await this.store.quarantineTownEstate(
          user.id,
          townId,
          rawBundle,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const recoveredBundles = Object.values(recoveredTownBundles);
    const freshestBundle = recoveredBundles
      .slice()
      .sort((left, right) => {
        const leftUpdatedAt = Math.max(
          left.farm.updatedAt,
          left.ranch.updatedAt,
          left.mine.updatedAt,
          left.homestead.updatedAt,
        );
        const rightUpdatedAt = Math.max(
          right.farm.updatedAt,
          right.ranch.updatedAt,
          right.mine.updatedAt,
          right.homestead.updatedAt,
        );
        return rightUpdatedAt - leftUpdatedAt;
      })[0];
    const recoveredGreenResearch = new Set(
      recoveredTownBundles.greenvale?.homestead.research.unlocked ??
        legacyHomestead?.research.unlocked ?? [],
    );
    const recoveredFrostResearch = new Set(
      recoveredTownBundles.frostpeak?.homestead.research.unlocked ?? [],
    );
    const recoveredMerchantRenown = Math.max(
      legacyHomestead?.townNetwork?.merchantRenown ?? 0,
      ...recoveredBundles.map((bundle) =>
        bundle.homestead.townNetwork.merchantRenown
      ),
    );

    const account = createEstateAccount({
      ownerId: user.id,
      ownerName: user.displayName,
      now: this.clock(),
      coins: freshestBundle?.farm.coins ?? legacyFarm?.coins,
      researchPoints:
        recoveredTownBundles.greenvale?.homestead.researchPoints ??
        legacyHomestead?.researchPoints,
      merchantRenown: recoveredMerchantRenown,
      unlockedResearchIds: [...recoveredGreenResearch],
    });
    account.townResearch.greenvale = {
      points:
        recoveredTownBundles.greenvale?.homestead.researchPoints ??
        legacyHomestead?.researchPoints ?? 0,
      unlockedIds: [...recoveredGreenResearch],
    };
    account.townResearch.frostpeak = {
      points: recoveredTownBundles.frostpeak?.homestead.researchPoints ?? 0,
      unlockedIds: [...recoveredFrostResearch],
    };
    const recoveredGreenvale = recoveredTownBundles.greenvale;
    account.townProgress.greenvale = recoveredGreenvale
      ? {
        unlocked: true,
        unlockedAt: recoveredGreenvale.homestead.createdAt,
        localReputation: recoveredGreenvale.homestead.reputation,
        farmLevel: recoveredGreenvale.farm.level,
        ranchLevel: recoveredGreenvale.ranch.level,
        mineLevel: recoveredGreenvale.mine.level,
        landmarkStage:
          recoveredGreenvale.homestead.townNetwork.towns.greenvale
            .landmarkStage,
        lastVisitedAt: recoveredGreenvale.homestead.updatedAt,
      }
      : {
      unlocked: true,
      unlockedAt: legacyHomestead?.createdAt ?? account.createdAt,
      localReputation: legacyHomestead?.reputation ?? 0,
      farmLevel: legacyFarm?.level ?? 1,
      ranchLevel: legacyRanch?.level ?? 1,
      mineLevel: legacyMine?.level ?? 1,
      landmarkStage:
        legacyHomestead?.townNetwork?.towns.greenvale.landmarkStage ?? 0,
      lastVisitedAt: this.clock(),
      };
    const recoveredFrostpeak = recoveredTownBundles.frostpeak;
    const legacyFrost = legacyHomestead?.townNetwork?.towns.frostpeak;
    const frostWasUsed = Boolean(
      recoveredFrostpeak ||
      legacyHomestead?.townNetwork?.activeTownId === "frostpeak" ||
      legacyFrost?.reputation ||
      legacyFrost?.landmarkStage ||
      legacyFrost?.resolvedProblemIds.length ||
      legacyFrost && Object.values(legacyFrost.inventory).some(
        (quantity) => quantity > 0,
      ) ||
      legacyFrost && Object.values(legacyFrost.sectors).some(
        (sector) => sector.cycle > 0 || sector.job !== null,
      ),
    );
    if (frostWasUsed) {
      account.townProgress.frostpeak = recoveredFrostpeak
        ? {
          unlocked: true,
          unlockedAt: recoveredFrostpeak.homestead.createdAt,
          localReputation: recoveredFrostpeak.homestead.reputation,
          farmLevel: recoveredFrostpeak.farm.level,
          ranchLevel: recoveredFrostpeak.ranch.level,
          mineLevel: recoveredFrostpeak.mine.level,
          landmarkStage:
            recoveredFrostpeak.homestead.townNetwork.towns.frostpeak
              .landmarkStage,
          lastVisitedAt: recoveredFrostpeak.homestead.updatedAt,
        }
        : {
          unlocked: true,
          unlockedAt: legacyHomestead?.updatedAt ?? account.createdAt,
          localReputation: legacyFrost?.reputation ?? 0,
          farmLevel: Math.max(1, legacyFrost?.sectors.farm.level ?? 1),
          ranchLevel: Math.max(1, legacyFrost?.sectors.ranch.level ?? 1),
          mineLevel: Math.max(1, legacyFrost?.sectors.mine.level ?? 1),
          landmarkStage: legacyFrost?.landmarkStage ?? 0,
          lastVisitedAt:
            legacyHomestead?.townNetwork?.activeTownId === "frostpeak"
              ? this.clock()
              : null,
        };
      if (
        freshestBundle?.townId === "frostpeak" ||
        (
          !freshestBundle &&
          legacyHomestead?.townNetwork?.activeTownId === "frostpeak"
        )
      ) {
        account.activeTownId = "frostpeak";
      }
    }
    account.researchPoints =
      account.townResearch[account.activeTownId].points;
    account.unlockedResearchIds = [
      ...account.townResearch[account.activeTownId].unlockedIds,
    ];
    await this.store.saveEstateAccount(user.id, account);
    return account;
  }

  private async loadExistingEstateAccount(
    userId: string,
  ): Promise<EstateAccountState> {
    const loaded = await this.store.loadEstateAccount(userId);
    if (loaded === undefined) {
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该好友尚未建立庄园账户",
      );
    }
    try {
      assertRestorableEstateAccount(loaded);
      return refreshEstateAccount(structuredClone(loaded), this.clock());
    } catch {
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该好友的庄园账户暂时无法访问",
      );
    }
  }

  private async loadOrCreateTownEstate(
    user: PublicUser,
    townId: EstateTownId,
    account: EstateAccountState,
  ): Promise<TownEstateBundle> {
    const loaded = await this.store.loadTownEstate(user.id, townId);
    if (loaded !== undefined) {
      try {
        this.assertTownEstateBundle(loaded, user.id, townId);
        const bundle = structuredClone(loaded);
        bundle.farm.ownerName = user.displayName;
        bundle.ranch.ownerName = user.displayName;
        bundle.mine.ownerName = user.displayName;
        bundle.homestead.ownerName = user.displayName;
        return this.syncBundleFromAccount(bundle, account);
      } catch (error) {
        await this.store.quarantineTownEstate(
          user.id,
          townId,
          loaded,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    let bundle: TownEstateBundle;
    if (townId === "greenvale") {
      const farm = await this.loadOrCreate(user);
      const ranch = await this.loadOrCreateRanch(user);
      const mine = await this.loadOrCreateMine(user);
      const homestead = await this.loadOrCreateHomestead(
        user,
        farm,
        ranch,
        mine,
      );
      bundle = {
        kind: "town_estate_bundle",
        version: TOWN_ESTATE_BUNDLE_VERSION,
        townId,
        contentVersion: TOWN_DEFINITIONS[townId].contentVersion,
        farm,
        ranch,
        mine,
        homestead,
      };
    } else {
      bundle = this.createTownEstateBundle(user, townId, account);
      const legacyHomestead = await this.store.loadHomesteadState(user.id);
      if (legacyHomestead !== undefined) {
        try {
          assertRestorableHomesteadGameState(legacyHomestead);
          const frost = legacyHomestead.townNetwork?.towns.frostpeak;
          if (frost) {
            bundle.farm.produce.snow_potato +=
              frost.inventory.snow_potato;
            bundle.ranch.products.yak_milk += frost.inventory.yak_milk;
            bundle.mine.ores.frost_crystal +=
              frost.inventory.frost_crystal;
            bundle.homestead.reputation = frost.reputation;
            bundle.homestead.townNetwork.towns.frostpeak.landmarkStage =
              frost.landmarkStage;
            bundle.homestead.townNetwork.towns.frostpeak.resolvedProblemIds =
              [...frost.resolvedProblemIds];
          }
        } catch {
          // Invalid legacy Frostpeak data is left in the legacy quarantine path.
        }
      }
    }
    bundle = this.syncBundleFromAccount(bundle, account);
    await this.store.saveTownEstate(user.id, townId, bundle);
    return bundle;
  }

  private async loadExistingTownEstate(
    userId: string,
    townId: EstateTownId,
  ): Promise<TownEstateBundle> {
    const loaded = await this.store.loadTownEstate(userId, townId);
    if (loaded === undefined) {
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该好友尚未在当前城镇建立庄园",
      );
    }
    try {
      this.assertTownEstateBundle(loaded, userId, townId);
      const bundle = structuredClone(loaded);
      bundle.farm = refreshFarmingGame(bundle.farm, this.clock());
      bundle.ranch = refreshRanchGame(bundle.ranch, this.clock());
      bundle.homestead = refreshHomesteadGame(
        bundle.homestead,
        this.clock(),
      );
      return bundle;
    } catch (error) {
      await this.store.quarantineTownEstate(
        userId,
        townId,
        loaded,
        error instanceof Error ? error.message : String(error),
      );
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该好友当前城镇的庄园暂时无法访问",
      );
    }
  }

  private createTownEstateBundle(
    user: PublicUser,
    townId: EstateTownId,
    account: EstateAccountState,
  ): TownEstateBundle {
    const now = this.clock();
    const farm = createFarmingGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now,
      townId,
    });
    const ranch = createRanchGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now,
      townId,
    });
    const mine = createMineGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now,
      townId,
    });
    const homestead = createHomesteadGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now,
      townId,
    });
    const bundle: TownEstateBundle = {
      kind: "town_estate_bundle",
      version: TOWN_ESTATE_BUNDLE_VERSION,
      townId,
      contentVersion: TOWN_DEFINITIONS[townId].contentVersion,
      farm,
      ranch,
      mine,
      homestead,
    };
    return this.syncBundleFromAccount(bundle, account);
  }

  private assertTownEstateBundle(
    value: unknown,
    ownerId: string,
    townId: EstateTownId,
  ): asserts value is TownEstateBundle {
    if (
      !value ||
      typeof value !== "object" ||
      (value as { kind?: unknown }).kind !== "town_estate_bundle" ||
      (value as { version?: unknown }).version !==
        TOWN_ESTATE_BUNDLE_VERSION ||
      (value as { townId?: unknown }).townId !== townId
    ) {
      throw new Error("城镇庄园存档结构无效");
    }
    const bundle = value as TownEstateBundle;
    assertRestorableFarmingGameState(bundle.farm);
    assertRestorableRanchGameState(bundle.ranch);
    assertRestorableMineGameState(bundle.mine);
    assertRestorableHomesteadGameState(bundle.homestead);
    if (
      bundle.farm.ownerId !== ownerId ||
      bundle.ranch.ownerId !== ownerId ||
      bundle.mine.ownerId !== ownerId ||
      bundle.homestead.ownerId !== ownerId
    ) {
      throw new Error("城镇庄园存档所有者不匹配");
    }
    if (
      bundle.farm.townId !== townId ||
      bundle.ranch.townId !== townId ||
      bundle.mine.townId !== townId ||
      bundle.homestead.townId !== townId
    ) {
      throw new Error("城镇庄园存档包含异镇产业状态");
    }
  }

  private syncBundleFromAccount(
    state: TownEstateBundle,
    account: EstateAccountState,
  ): TownEstateBundle {
    const bundle = structuredClone(state);
    bundle.farm.coins = account.coins;
    const localResearch = account.townResearch[bundle.townId];
    bundle.homestead.researchPoints = localResearch.points;
    bundle.homestead.research.unlocked = [
      ...new Set(localResearch.unlockedIds),
    ] as HomesteadGameState["research"]["unlocked"];
    bundle.homestead.townNetwork.activeTownId = bundle.townId;
    bundle.homestead.townNetwork.merchantRenown = account.merchantRenown;
    (bundle.farm as FarmingGameState & { townId?: EstateTownId }).townId =
      bundle.townId;
    (bundle.ranch as RanchGameState & { townId?: EstateTownId }).townId =
      bundle.townId;
    (bundle.mine as MineGameState & { townId?: EstateTownId }).townId =
      bundle.townId;
    (bundle.homestead as HomesteadGameState & { townId?: EstateTownId })
      .townId = bundle.townId;
    return bundle;
  }

  private syncAccountFromBundle(
    state: EstateAccountState,
    bundle: TownEstateBundle,
  ): EstateAccountState {
    const account = structuredClone(state);
    const fingerprint = (value: EstateAccountState): string => {
      const progress = value.townProgress[bundle.townId];
      return JSON.stringify([
        value.coins,
        value.townResearch[bundle.townId].points,
        value.merchantRenown,
        [...value.townResearch[bundle.townId].unlockedIds].sort(),
        progress
          ? [
              progress.unlocked,
              progress.unlockedAt,
              progress.localReputation,
              progress.farmLevel,
              progress.ranchLevel,
              progress.mineLevel,
              progress.landmarkStage,
              progress.lastVisitedAt,
            ]
          : null,
        value.shopRecommendationId,
        value.shopRecommendationSource,
      ]);
    };
    const previous = fingerprint(account);
    account.coins = bundle.farm.coins;
    account.townResearch[bundle.townId] = {
      points: bundle.homestead.researchPoints,
      unlockedIds: [...new Set(bundle.homestead.research.unlocked)],
    };
    if (account.activeTownId === bundle.townId) {
      account.researchPoints = bundle.homestead.researchPoints;
      account.unlockedResearchIds = [
        ...account.townResearch[bundle.townId].unlockedIds,
      ];
    }
    account.merchantRenown =
      bundle.homestead.townNetwork.merchantRenown;
    const recommendedItemId =
      bundle.homestead.advice.merchantRecommendationId;
    if (recommendedItemId === null) {
      account.shopRecommendationId = null;
      account.shopRecommendationSource =
        bundle.homestead.advice.source === "llm" ? "llm" : "rules";
    } else if (
      recommendedItemId &&
      Object.prototype.hasOwnProperty.call(
        ESTATE_MERCHANT_ITEMS,
        recommendedItemId,
      )
    ) {
      account.shopRecommendationId = recommendedItemId;
      account.shopRecommendationSource =
        bundle.homestead.advice.source === "llm" ? "llm" : "rules";
    }
    account.townProgress[bundle.townId] = {
      unlocked: true,
      unlockedAt:
        account.townProgress[bundle.townId]?.unlockedAt ??
          bundle.homestead.createdAt,
      localReputation: bundle.homestead.reputation,
      farmLevel: bundle.farm.level,
      ranchLevel: bundle.ranch.level,
      mineLevel: bundle.mine.level,
      landmarkStage:
        bundle.homestead.townNetwork.towns[bundle.townId].landmarkStage,
      lastVisitedAt:
        account.townProgress[bundle.townId]?.lastVisitedAt ?? this.clock(),
    };
    const next = fingerprint(account);
    if (previous !== next) {
      account.revision += 1;
      account.updatedAt = Math.max(account.updatedAt, this.clock());
    }
    return account;
  }

  private async loadOrCreate(user: PublicUser): Promise<FarmingGameState> {
    const loaded = await this.store.load(user.id);
    if (loaded === undefined) {
      const game = this.create(user);
      await this.store.save(user.id, game);
      return game;
    }
    let game: FarmingGameState;
    try {
      game = await this.restore(user.id, loaded);
    } catch (error) {
      return this.recoverInvalid(
        user.id,
        loaded,
        error instanceof Error ? error.message : String(error),
        user,
      );
    }
    if (game.ownerId !== user.id) {
      return this.recoverInvalid(
        user.id,
        loaded,
        "Farm save owner does not match the authenticated user",
        user,
      );
    }
    let changed = false;
    if (game.ownerName !== user.displayName) {
      game.ownerName = user.displayName;
      changed = true;
    }
    const previousMarketDay = game.marketDay;
    const refreshed = refreshFarmingGame(game, this.clock());
    if (refreshed.revision !== game.revision) changed = true;
    if (changed) {
      refreshed.updatedAt = Math.max(refreshed.updatedAt, this.clock());
      await this.store.save(user.id, refreshed);
    }
    if (refreshed.marketDay !== previousMarketDay) {
      const directed = await this.applyMarketDirector(refreshed, user.id);
      if (directed.revision !== refreshed.revision) {
        await this.store.save(user.id, directed);
      }
      return directed;
    }
    return refreshed;
  }

  private async loadExisting(userId: string): Promise<FarmingGameState> {
    const loaded = await this.store.load(userId);
    if (loaded === undefined) {
      throw new HttpError(404, "FARMING_NEIGHBOR_NOT_FOUND", "该农友尚未建立农场");
    }
    let game: FarmingGameState;
    try {
      game = await this.restore(userId, loaded);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.store.quarantine(userId, loaded, reason);
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该农友的农场暂时无法访问",
      );
    }
    if (game.ownerId !== userId) {
      await this.store.quarantine(
        userId,
        loaded,
        "Farm save owner does not match its storage key",
      );
      throw new HttpError(
        404,
        "FARMING_NEIGHBOR_NOT_FOUND",
        "该农友的农场暂时无法访问",
      );
    }
    const refreshed = refreshFarmingGame(game, this.clock());
    if (refreshed.revision !== game.revision) {
      await this.store.save(userId, refreshed);
    }
    return refreshed;
  }

  private async loadOrCreateRanch(user: PublicUser): Promise<RanchGameState> {
    const loaded = await this.store.loadRanch(user.id);
    if (loaded === undefined) {
      const ranch = this.createRanch(user);
      await this.store.saveRanch(user.id, ranch);
      return ranch;
    }
    let ranch: RanchGameState;
    try {
      assertRestorableRanchGameState(loaded);
      ranch = structuredClone(loaded);
    } catch (error) {
      return this.recoverInvalidRanch(
        user.id,
        loaded,
        error instanceof Error ? error.message : String(error),
        user,
      );
    }
    if (ranch.ownerId !== user.id) {
      return this.recoverInvalidRanch(
        user.id,
        loaded,
        "Ranch save owner does not match the authenticated user",
        user,
      );
    }
    let changed = false;
    if (ranch.ownerName !== user.displayName) {
      ranch.ownerName = user.displayName;
      changed = true;
    }
    const refreshed = refreshRanchGame(ranch, this.clock());
    if (refreshed.revision !== ranch.revision) changed = true;
    if (changed) {
      refreshed.updatedAt = Math.max(refreshed.updatedAt, this.clock());
      await this.store.saveRanch(user.id, refreshed);
    }
    return refreshed;
  }

  private async loadExistingRanch(userId: string): Promise<RanchGameState> {
    const loaded = await this.store.loadRanch(userId);
    if (loaded === undefined) {
      throw new HttpError(404, "RANCH_NEIGHBOR_NOT_FOUND", "该农友尚未建立牧场");
    }
    let ranch: RanchGameState;
    try {
      assertRestorableRanchGameState(loaded);
      ranch = structuredClone(loaded);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.store.quarantineRanch(userId, loaded, reason);
      throw new HttpError(
        404,
        "RANCH_NEIGHBOR_NOT_FOUND",
        "该农友的牧场暂时无法访问",
      );
    }
    if (ranch.ownerId !== userId) {
      await this.store.quarantineRanch(
        userId,
        loaded,
        "Ranch save owner does not match its storage key",
      );
      throw new HttpError(
        404,
        "RANCH_NEIGHBOR_NOT_FOUND",
        "该农友的牧场暂时无法访问",
      );
    }
    const refreshed = refreshRanchGame(ranch, this.clock());
    if (refreshed.revision !== ranch.revision) {
      await this.store.saveRanch(userId, refreshed);
    }
    return refreshed;
  }

  private async loadOrCreateMine(user: PublicUser): Promise<MineGameState> {
    const loaded = await this.store.loadMine(user.id);
    if (loaded === undefined) {
      const mine = this.createMine(user);
      await this.store.saveMine(user.id, mine);
      return mine;
    }
    let mine: MineGameState;
    try {
      assertRestorableMineGameState(loaded);
      mine = structuredClone(loaded);
    } catch (error) {
      return this.recoverInvalidMine(
        user.id,
        loaded,
        error instanceof Error ? error.message : String(error),
        user,
      );
    }
    if (mine.ownerId !== user.id) {
      return this.recoverInvalidMine(
        user.id,
        loaded,
        "Mine save owner does not match the authenticated user",
        user,
      );
    }
    if (mine.ownerName !== user.displayName) {
      mine.ownerName = user.displayName;
      mine.updatedAt = Math.max(mine.updatedAt, this.clock());
      await this.store.saveMine(user.id, mine);
    }
    return mine;
  }

  private async loadOrCreateHomestead(
    user: PublicUser,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
  ): Promise<HomesteadGameState> {
    const loaded = await this.store.loadHomesteadState(user.id);
    if (loaded === undefined) {
      const initial = this.createHomestead(user);
      const homestead = this.directorJobs
        ? initial
        : await this.applyHomesteadDirector(
            initial,
            farm,
            ranch,
            mine,
            user.id,
          );
      await this.store.saveHomesteadState(user.id, homestead);
      return homestead;
    }
    let homestead: HomesteadGameState;
    try {
      assertRestorableHomesteadGameState(loaded);
      homestead = structuredClone(loaded);
    } catch (error) {
      return this.recoverInvalidHomestead(
        user.id,
        loaded,
        error instanceof Error ? error.message : String(error),
        user,
      );
    }
    if (homestead.ownerId !== user.id) {
      return this.recoverInvalidHomestead(
        user.id,
        loaded,
        "Homestead save owner does not match the authenticated user",
        user,
      );
    }
    let changed = false;
    if (homestead.ownerName !== user.displayName) {
      homestead.ownerName = user.displayName;
      changed = true;
    }
    const previousDay = homestead.dayKey;
    let refreshed = refreshHomesteadGame(homestead, this.clock());
    if (refreshed.revision !== homestead.revision) changed = true;
    if (refreshed.dayKey !== previousDay) {
      if (!this.directorJobs) {
        refreshed = await this.applyHomesteadDirector(
          refreshed,
          farm,
          ranch,
          mine,
          user.id,
        );
      }
      changed = true;
    }
    if (changed) {
      refreshed.updatedAt = Math.max(refreshed.updatedAt, this.clock());
      await this.store.saveHomesteadState(user.id, refreshed);
    }
    return refreshed;
  }

  private async restore(
    userId: string,
    loaded: unknown,
  ): Promise<FarmingGameState> {
    if (
      loaded &&
      typeof loaded === "object" &&
      "version" in loaded &&
      loaded.version === FARMING_STATE_VERSION
    ) {
      assertRestorableFarmingGameState(loaded);
      return structuredClone(loaded);
    }
    try {
      const migrated = migrateLegacyFarmGame(loaded, this.clock());
      await this.store.save(userId, migrated);
      return migrated;
    } catch (error) {
      if (
        loaded &&
        typeof loaded === "object" &&
        "version" in loaded &&
        loaded.version === 1
      ) {
        throw error;
      }
      throw new Error(
        error instanceof Error ? error.message : "实时农场存档无效",
      );
    }
  }

  private async recoverInvalid(
    userId: string,
    loaded: unknown,
    reason: string,
    user: PublicUser,
  ): Promise<FarmingGameState> {
    await this.store.quarantine(userId, loaded, reason);
    console.error(`Quarantined invalid farm save for user ${userId}: ${reason}`);
    const game = this.create(user);
    await this.store.save(userId, game);
    return game;
  }

  private async recoverInvalidRanch(
    userId: string,
    loaded: unknown,
    reason: string,
    user: PublicUser,
  ): Promise<RanchGameState> {
    await this.store.quarantineRanch(userId, loaded, reason);
    console.error(`Quarantined invalid ranch save for user ${userId}: ${reason}`);
    const ranch = this.createRanch(user);
    await this.store.saveRanch(userId, ranch);
    return ranch;
  }

  private async recoverInvalidMine(
    userId: string,
    loaded: unknown,
    reason: string,
    user: PublicUser,
  ): Promise<MineGameState> {
    await this.store.quarantineMine(userId, loaded, reason);
    console.error(`Quarantined invalid mine save for user ${userId}: ${reason}`);
    const mine = this.createMine(user);
    await this.store.saveMine(userId, mine);
    return mine;
  }

  private async recoverInvalidHomestead(
    userId: string,
    loaded: unknown,
    reason: string,
    user: PublicUser,
  ): Promise<HomesteadGameState> {
    await this.store.quarantineHomestead(userId, loaded, reason);
    console.error(
      `Quarantined invalid homestead save for user ${userId}: ${reason}`,
    );
    const homestead = this.createHomestead(user);
    await this.store.saveHomesteadState(userId, homestead);
    return homestead;
  }

  private create(user: PublicUser): FarmingGameState {
    return createFarmingGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now: this.clock(),
    });
  }

  private createRanch(user: PublicUser): RanchGameState {
    return createRanchGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now: this.clock(),
    });
  }

  private createMine(user: PublicUser): MineGameState {
    return createMineGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now: this.clock(),
    });
  }

  private createHomestead(user: PublicUser): HomesteadGameState {
    return createHomesteadGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: randomBytes(24).toString("hex"),
      now: this.clock(),
    });
  }

  private homesteadDirectorContext(
    account: EstateAccountState,
    bundle: TownEstateBundle,
  ): HomesteadDirectorContext {
    const now = this.clock();
    const view = getHomesteadGameView(
      bundle.homestead,
      this.homesteadEconomy(
        bundle.farm,
        bundle.ranch,
        bundle.mine,
        account,
      ),
      now,
    );
    const activeCargoRoutes = view.intertownLogistics.routes.filter(
      ({ fromTownId }) => fromTownId === account.activeTownId,
    );
    const valueRouteDeficits = view.valueRoutes
      .filter(({ completedToday, requirementsView }) =>
        !completedToday && requirementsView.some(({ sufficient }) => !sufficient)
      )
      .map((route) => {
        const missing = route.requirementsView
          .filter(({ sufficient }) => !sufficient)
          .map(({ source, itemId, available, quantity }) =>
            `${source}/${itemId} ${available}/${quantity}`
          )
          .join("、");
        return `${route.title}缺口：${missing}`;
      });
    return {
      coins: account.coins,
      localReputation:
        account.townProgress[account.activeTownId]?.localReputation ?? 0,
      merchantRenown: account.merchantRenown,
      logistics: structuredClone(account.logistics),
      merchantCandidates: estateMerchantOfferIds(account).map(
        (itemId) => ESTATE_MERCHANT_ITEMS[itemId],
      ).map((item) => {
          const owned = account.merchantInventory[item.id];
          const purchasedToday =
            account.purchaseLedger.counts[item.id];
          const disabledReason =
            account.merchantRenown < item.requiredRenown
              ? `商会名望达到 ${item.requiredRenown} 后开放`
              : account.coins < item.coinPrice
                ? "金币不足"
                : owned >= item.inventoryLimit
                  ? "库存已达上限"
                  : purchasedToday >= item.dailyPurchaseLimit
                    ? "今日限购次数已用完"
                    : null;
          return {
            itemId: item.id,
            owned,
            purchasedToday,
            canBuy: disabledReason === null,
            disabledReason,
          };
        },
      ),
      townProgress: view.towns.map((town) => ({
        townId: town.definition.id,
        townName: town.definition.name,
        active: town.active,
        unlocked: town.unlocked,
        localReputation: town.reputation,
        farmLevel:
          account.townProgress[town.definition.id]?.farmLevel ?? 1,
        ranchLevel:
          account.townProgress[town.definition.id]?.ranchLevel ?? 1,
        mineLevel:
          account.townProgress[town.definition.id]?.mineLevel ?? 1,
        landmarkStage: town.landmarkStage,
      })),
      shipments: view.intertownLogistics.shipments
        .filter(({ status }) => status !== "collected")
        .map((shipment) => ({
          cargoName: shipment.definition.name,
          fromTown: TOWN_DEFINITIONS[shipment.fromTownId].name,
          toTown: TOWN_DEFINITIONS[shipment.toTownId].name,
          status: shipment.status,
          secondsRemaining: Math.max(
            0,
            Math.ceil((shipment.arrivesAt - now) / 1_000),
          ),
          canCollect: shipment.canCollect,
        })),
      cargoRoutes: activeCargoRoutes.map((route) => ({
        cargoName: route.name,
        fromTown: TOWN_DEFINITIONS[route.fromTownId].name,
        toTown: TOWN_DEFINITIONS[route.toTownId].name,
        canDispatch: route.canDispatch,
        disabledReason: route.disabledReason,
        missingResources: route.requirementsView
          .filter(({ sufficient }) => !sufficient)
          .map(({ source, itemId, available, quantity }) =>
            `${source}/${itemId} ${available}/${quantity}`
          ),
      })),
      valueRouteDeficits,
      economicBottlenecks: [
        ...valueRouteDeficits,
        ...activeCargoRoutes
          .filter(({ canDispatch }) => !canDispatch)
          .map((route) =>
            `${route.name}暂不可发车：${route.disabledReason ?? "条件未满足"}`
          ),
      ].slice(0, 8),
    };
  }

  private async applyMarketDirector(
    game: FarmingGameState,
    playerId: string,
  ): Promise<FarmingGameState> {
    const request = createFarmMarketDecision(game, playerId);
    if (!request) return game;
    try {
      const result = await this.decisions.decide("farm", request.input);
      const selected = result?.candidateIndex === null || result === null
        ? undefined
        : request.input.candidates[result.candidateIndex];
      return selected
        ? applyFarmingMarketDecision(game, selected, this.clock())
        : game;
    } catch (error) {
      console.error("Farm market director failed; using rules fallback", error);
      return game;
    }
  }

  private async applyHomesteadDirector(
    homestead: HomesteadGameState,
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
    playerId: string,
    context?: HomesteadDirectorContext,
  ): Promise<HomesteadGameState> {
    if (!this.decisions.supports("homestead")) return homestead;
    const request = createHomesteadDirectorDecision(
      homestead,
      farm,
      ranch,
      mine,
      playerId,
      context,
    );
    if (!request) return homestead;
    const townId =
      homestead.townId ?? homestead.townNetwork.activeTownId;
    const authorization = this.llmGovernance
      ? await this.llmGovernance.authorize({
          userId: playerId,
          feature: "homestead",
          townId,
          dayKey: homestead.dayKey,
        })
      : { allowed: true as const };
    if (!authorization.allowed) return homestead;
    const startedAt = Date.now();
    try {
      const result = await this.decisions.decide(
        "homestead",
        request.input,
      );
      const selected = result?.candidateIndex === null || result === null
        ? undefined
        : request.input.candidates[result.candidateIndex];
      const planSteps = result?.presentation?.planStepIndices
        ?.map((index) => request.input.state.planCandidates[index])
        .filter((candidate) => candidate !== undefined);
      const advisorIndex = result?.presentation?.advisorIndex;
      const resolvedAdvisorIndex = Number.isSafeInteger(advisorIndex) &&
          Number(advisorIndex) >= 0
        ? Number(advisorIndex)
        : 0;
      const directorNpcId = homestead.npcs[resolvedAdvisorIndex]?.npcId ??
        homestead.npcs[0]!.npcId;
      const selectedBeatId = result?.presentation?.directorBeatId;
      const directorBeatId = selectedBeatId &&
          request.input.state.directorBeatCandidates.some(
            ({ id }) => id === selectedBeatId,
          )
        ? selectedBeatId
        : request.input.state.directorBeatCandidates[0]!.id;
      const rawEvidenceIndices = result?.presentation?.evidenceIndices;
      const evidenceIndices = [
        ...new Set(
          rawEvidenceIndices?.length ? rawEvidenceIndices : [0],
        ),
      ].slice(0, 3);
      const directorEvidence = evidenceIndices
        .map((index) => request.input.state.evidenceFacts[index])
        .filter((fact) => fact !== undefined);
      const compiled = selected
        ? compileHomesteadGeneratedEvent(
            {
              townId:
                homestead.townId ??
                homestead.townNetwork.activeTownId,
              dayKey: homestead.dayKey,
              templateId: selected.eventId,
              narrative: result?.presentation?.narrative,
              pacingId: result?.presentation?.eventPacingId,
            },
            request.input.candidates.map(({ eventId }) => eventId),
            {
              allowHazard: homestead.disaster !== null,
              candidateWasPrevalidated: true,
              allowedPacingIds: request.input.state.pacingCandidates
                .map(({ id }) => id),
            },
          )
        : undefined;
      if (!compiled) {
        if (result === null) {
          await this.llmGovernance?.record({
            userId: playerId,
            feature: "homestead",
            townId,
            dayKey: homestead.dayKey,
            status: "failure",
            failureReason: "provider_unavailable",
            candidateCount: request.input.candidates.length,
            latencyMs: Math.max(0, Date.now() - startedAt),
          });
          return homestead;
        }
        await this.llmGovernance?.record({
          userId: playerId,
          feature: "homestead",
          townId,
          dayKey: homestead.dayKey,
          status: "fallback",
          failureReason:
            result.failureReason as LlmGovernanceReason | undefined ??
              "compile_rejected",
          candidateCount: request.input.candidates.length,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        const fallback = structuredClone(homestead);
        fallback.statistics.llmCalls += 1;
        fallback.statistics.llmFallbacks += 1;
        fallback.statistics.llmPromptTokens += result.usage.promptTokens;
        fallback.statistics.llmCompletionTokens +=
          result.usage.completionTokens;
        fallback.updatedAt = Math.max(fallback.updatedAt, this.clock());
        fallback.revision += 1;
        return fallback;
      }
      const directed = homestead.worldEvent.selectedOptionId !== null
        ? (() => {
            const next = structuredClone(homestead);
            const now = this.clock();
            next.advice = {
              ...next.advice,
              dayKey: next.dayKey,
              source: "llm",
              headline:
                result?.presentation?.title ??
                HOMESTEAD_WORLD_EVENTS[next.worldEvent.eventId].title,
              narrative:
                result?.presentation?.narrative ?? next.worldEvent.narrative,
              recommendation:
                result?.presentation?.recommendation ??
                next.advice.recommendation,
              npcId: directorNpcId,
              npcLine:
                result?.presentation?.npcLine ?? next.advice.npcLine,
              generatedAt: now,
              worldBeatId: directorBeatId,
              ...(result?.presentation?.foreshadowing?.trim()
                ? {
                    foreshadowing: result.presentation.foreshadowing
                      .trim()
                      .slice(0, 120),
                  }
                : {}),
              evidence: directorEvidence,
              ...(planSteps?.length === 3 ? { steps: planSteps } : {}),
              ...(result?.presentation?.merchantRecommendationId
                ? {
                    merchantRecommendationId:
                      result.presentation.merchantRecommendationId,
                  }
                : {}),
            };
            next.statistics.llmCalls += 1;
            next.statistics.llmPromptTokens += result!.usage.promptTokens;
            next.statistics.llmCompletionTokens +=
              result!.usage.completionTokens;
            next.updatedAt = Math.max(next.updatedAt, now);
            next.revision += 1;
            return next;
          })()
        : applyHomesteadWorldEventDecision(
            homestead,
            compiled.eventId,
            "llm",
            this.clock(),
            {
              headline: result?.presentation?.title,
              narrative: compiled.narrative,
              recommendation: result?.presentation?.recommendation,
              npcId: directorNpcId,
              npcLine: result?.presentation?.npcLine,
              worldBeatId: directorBeatId,
              foreshadowing: result?.presentation?.foreshadowing,
              ...(directorEvidence.length > 0
                ? { evidence: directorEvidence }
                : {}),
              ...(planSteps?.length === 3 ? { planSteps } : {}),
              eventInstanceId: compiled.instanceId,
              eventRulesVersion: compiled.rulesVersion,
              llmUsage: result!.usage,
              eventParameters: compiled.parameters,
              ...(result?.presentation?.merchantRecommendationId
                ? {
                    merchantRecommendationId:
                      result.presentation.merchantRecommendationId,
                  }
                : {}),
            },
          );
      await this.llmGovernance?.record({
        userId: playerId,
        feature: "homestead",
        townId,
        dayKey: homestead.dayKey,
        status: "success",
        candidateCount: request.input.candidates.length,
        selectedEventId: compiled.eventId,
        eventInstanceId: compiled.instanceId,
        promptTokens: result!.usage.promptTokens,
        completionTokens: result!.usage.completionTokens,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      return directed;
    } catch (error) {
      await this.llmGovernance?.record({
        userId: playerId,
        feature: "homestead",
        townId,
        dayKey: homestead.dayKey,
        status: "failure",
        failureReason: botDecisionFailureReason(error),
        candidateCount: request.input.candidates.length,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      console.error(
        "Homestead world director failed; using rules fallback",
        error,
      );
      const fallback = structuredClone(homestead);
      fallback.statistics.llmCalls += 1;
      fallback.statistics.llmFallbacks += 1;
      fallback.updatedAt = Math.max(fallback.updatedAt, this.clock());
      fallback.revision += 1;
      return fallback;
    }
  }

  private assertRevision(game: FarmingGameState, expectedRevision: number): void {
    if (game.revision !== expectedRevision) {
      throw new HttpError(
        409,
        "FARM_REVISION_CONFLICT",
        "农场存档已更新，请刷新后重试",
      );
    }
  }

  private assertRanchRevision(
    game: RanchGameState,
    expectedRevision: number,
  ): void {
    if (game.revision !== expectedRevision) {
      throw new HttpError(
        409,
        "RANCH_REVISION_CONFLICT",
        "牧场存档已更新，请刷新后重试",
      );
    }
  }

  private assertMineRevision(
    game: MineGameState,
    expectedRevision: number,
  ): void {
    if (game.revision !== expectedRevision) {
      throw new HttpError(
        409,
        "MINE_REVISION_CONFLICT",
        "矿山存档已更新，请刷新后重试",
      );
    }
  }

  private assertHomesteadRevision(
    game: HomesteadGameState,
    expectedRevision: number,
  ): void {
    if (game.revision !== expectedRevision) {
      throw new HttpError(
        409,
        "HOMESTEAD_REVISION_CONFLICT",
        "庄园状态已更新，请刷新后重试",
      );
    }
  }

  private assertExpectedTown(
    activeTownId: EstateTownId,
    expectedTownId?: EstateTownId,
  ): void {
    if (expectedTownId !== undefined && expectedTownId !== activeTownId) {
      throw new HttpError(
        409,
        "ESTATE_TOWN_CONFLICT",
        "当前城镇已在其他页面切换，请刷新后重试",
      );
    }
  }

  private mapRuleError(error: unknown): never {
    if (error instanceof FarmingRuleError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }

  private mapRanchRuleError(error: unknown): never {
    if (error instanceof RanchRuleError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }

  private mapMineRuleError(error: unknown): never {
    if (error instanceof MineRuleError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }

  private mapHomesteadRuleError(error: unknown): never {
    if (error instanceof HomesteadRuleError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }

  private async neighborSummaries(
    userId: string,
    townId: EstateTownId,
  ): Promise<FarmingNeighborSummary[]> {
    const now = this.clock();
    const loaded = await this.store.listTownEstates(townId, 40);
    return loaded
      .flatMap((candidate) => {
        try {
          if (
            !candidate ||
            typeof candidate !== "object" ||
            (candidate as { townId?: unknown }).townId !== townId
          ) return [];
          const farm = (candidate as TownEstateBundle).farm;
          assertRestorableFarmingGameState(farm);
          const summary = getFarmingNeighborSummary(farm, userId, now);
          return summary ? [summary] : [];
        } catch {
          return [];
        }
      })
      .sort((left, right) =>
        right.stealablePlots - left.stealablePlots ||
        right.careNeededPlots - left.careNeededPlots ||
        right.updatedAt - left.updatedAt
      )
      .slice(0, 30);
  }

  private async snapshot(
    game: FarmingGameState,
    userId: string,
    townId: EstateTownId,
    production?: EstateProductionRule,
  ): Promise<FarmSnapshot> {
    return {
      farm: getFarmingGameView(game, userId, this.clock(), production),
      neighbors: await this.neighborSummaries(userId, townId),
      marketDirectorAvailable: this.marketDirectorAvailable,
    };
  }

  private async ranchNeighborSummaries(
    userId: string,
    townId: EstateTownId,
  ): Promise<RanchNeighborSummary[]> {
    const now = this.clock();
    const loaded = await this.store.listTownEstates(townId, 40);
    return loaded
      .flatMap((candidate) => {
        try {
          if (
            !candidate ||
            typeof candidate !== "object" ||
            (candidate as { townId?: unknown }).townId !== townId
          ) return [];
          const ranch = (candidate as TownEstateBundle).ranch;
          assertRestorableRanchGameState(ranch);
          const summary = getRanchNeighborSummary(ranch, userId, now);
          return summary ? [summary] : [];
        } catch {
          return [];
        }
      })
      .sort((left, right) =>
        right.collectiblePens - left.collectiblePens ||
        right.careNeededPens - left.careNeededPens ||
        right.updatedAt - left.updatedAt
      )
      .slice(0, 30);
  }

  private async ranchSnapshot(
    ranch: RanchGameState,
    farm: FarmingGameState,
    userId: string,
    townId: EstateTownId,
    production?: EstateProductionRule,
  ): Promise<RanchSnapshot> {
    return {
      ranch: this.ranchView(ranch, farm, userId, production),
      neighbors: await this.ranchNeighborSummaries(userId, townId),
    };
  }

  private ranchView(
    ranch: RanchGameState,
    farm: FarmingGameState,
    viewerId: string,
    production?: EstateProductionRule,
  ): RanchGameView {
    return getRanchGameView(ranch, {
      viewerId,
      now: this.clock(),
      farmRevision: farm.revision,
      farmLevel: farm.level,
      dogLevel: farm.dogLevel,
      production,
      ...(viewerId === farm.ownerId
        ? { coins: farm.coins, produce: farm.produce }
      : {}),
    });
  }

  private mineView(
    mine: MineGameState,
    farm: FarmingGameState,
    ranch: RanchGameState,
    production?: EstateProductionRule,
  ): MineGameView {
    return getMineGameView(mine, {
      farmRevision: farm.revision,
      farmLevel: farm.level,
      coins: farm.coins,
      farmProduce: farm.produce,
      ranchRevision: ranch.revision,
      ranchLevel: ranch.level,
      ranchProducts: ranch.products,
    }, this.clock(), production);
  }

  private homesteadEconomy(
    farm: FarmingGameState,
    ranch: RanchGameState,
    mine: MineGameState,
    account?: EstateAccountState,
  ): HomesteadLinkedEconomy {
    return {
      farmRevision: farm.revision,
      ranchRevision: ranch.revision,
      mineRevision: mine.revision,
      coins: account?.coins ?? farm.coins,
      farmProduce: farm.produce,
      ranchProducts: ranch.products,
      mineOres: mine.ores,
      ...(account
        ? {
            accountRevision: account.revision,
            activeTownId: account.activeTownId,
            unlockedTownIds: Object.entries(account.townProgress)
              .filter(([, progress]) => progress?.unlocked)
              .map(([townId]) => townId as EstateTownId),
            merchantRenown: account.merchantRenown,
            townProgress: structuredClone(account.townProgress),
            merchantInventory: structuredClone(account.merchantInventory),
            purchaseLedger: structuredClone(account.purchaseLedger),
            logistics: structuredClone(account.logistics),
            travelLogs: structuredClone(account.travelLogs),
            shipments: structuredClone(account.shipments),
            shopRecommendationId: account.shopRecommendationId,
            shopRecommendationSource: account.shopRecommendationSource,
          }
        : {}),
    };
  }

  private async serializedMany<T>(
    userIds: string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const uniqueIds = [...new Set(userIds)].sort();
    const previous = uniqueIds.map(
      (userId) => this.queues.get(userId) ?? Promise.resolve(),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = Promise.all(
      previous.map((pending) => pending.catch(() => undefined)),
    ).then(() => gate);
    for (const userId of uniqueIds) this.queues.set(userId, queued);
    await Promise.all(previous.map((pending) => pending.catch(() => undefined)));

    try {
      return this.store.withUserLocks
        ? await this.store.withUserLocks(uniqueIds, operation)
        : await operation();
    } finally {
      release();
      for (const userId of uniqueIds) {
        if (this.queues.get(userId) === queued) this.queues.delete(userId);
      }
    }
  }
}
