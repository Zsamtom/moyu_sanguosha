import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
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
  RanchRuleError,
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
} from "@sanguosha/shared";
import type { BotDecisionRegistry } from "./bots/decision-registry.js";
import { createFarmMarketDecision } from "./bots/farm-market-llm.js";
import { HttpError } from "./errors.js";
import type { PublicUser } from "./users.js";

export type FarmClientAction = FarmingAction;
export type FarmVisitClientAction = FarmingVisitAction;
export type RanchClientAction = RanchAction;
export type RanchVisitClientAction = RanchVisitAction;
export type MineClientAction = MineAction;

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

export interface FarmStateStore {
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
}

export class PostgresFarmStateStore implements FarmStateStore {
  constructor(private readonly pool: Pool) {}

  async load(userId: string): Promise<unknown | undefined> {
    const result = await this.pool.query<{ state: unknown }>(
      "SELECT state FROM farm_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async list(limit: number): Promise<unknown[]> {
    const result = await this.pool.query<{ state: unknown }>(
      `SELECT state FROM farm_state
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.state);
  }

  async save(userId: string, state: FarmingGameState): Promise<void> {
    await this.pool.query(
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
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async quarantine(userId: string, state: unknown, reason: string): Promise<void> {
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async loadRanch(userId: string): Promise<unknown | undefined> {
    const result = await this.pool.query<{ state: unknown }>(
      "SELECT state FROM ranch_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async listRanches(limit: number): Promise<unknown[]> {
    const result = await this.pool.query<{ state: unknown }>(
      `SELECT state FROM ranch_state
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.state);
  }

  async saveRanch(userId: string, state: RanchGameState): Promise<void> {
    await this.pool.query(
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
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async saveRanchPair(
    firstUserId: string,
    firstState: RanchGameState,
    secondUserId: string,
    secondState: RanchGameState,
  ): Promise<void> {
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async quarantineRanch(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async loadMine(userId: string): Promise<unknown | undefined> {
    const result = await this.pool.query<{ state: unknown }>(
      "SELECT state FROM mine_state WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.state;
  }

  async saveMine(userId: string, state: MineGameState): Promise<void> {
    await this.pool.query(
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
    const client = await this.pool.connect();
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
      client.release();
    }
  }

  async quarantineMine(
    userId: string,
    state: unknown,
    reason: string,
  ): Promise<void> {
    const client = await this.pool.connect();
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
      client.release();
    }
  }
}

export class MemoryFarmStateStore implements FarmStateStore {
  private readonly states = new Map<string, unknown>();
  private readonly ranchStates = new Map<string, unknown>();
  private readonly mineStates = new Map<string, unknown>();
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
}

export class FarmService {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: FarmStateStore,
    private readonly decisions: BotDecisionRegistry,
    private readonly clock: () => number = Date.now,
  ) {}

  get marketDirectorAvailable(): boolean {
    return this.decisions.supports("farm");
  }

  async getOrCreate(user: PublicUser): Promise<FarmSnapshot> {
    return this.serializedMany([user.id], async () => {
      const game = await this.loadOrCreate(user);
      return this.snapshot(game, user.id);
    });
  }

  async applyAction(
    user: PublicUser,
    expectedRevision: number,
    action: FarmClientAction,
  ): Promise<FarmActionSnapshot> {
    return this.serializedMany([user.id], async () => {
      const game = await this.loadOrCreate(user);
      this.assertRevision(game, expectedRevision);
      let next: FarmingGameState;
      try {
        next = applyFarmingAction(game, action, this.clock());
      } catch (error) {
        this.mapRuleError(error);
      }
      await this.store.save(user.id, next!);
      return {
        farm: getFarmingGameView(next!, user.id, this.clock()),
        marketDirectorAvailable: this.marketDirectorAvailable,
      };
    });
  }

  async getNeighbors(user: PublicUser): Promise<FarmingNeighborSummary[]> {
    return this.neighborSummaries(user.id);
  }

  async getNeighbor(
    user: PublicUser,
    neighborId: string,
  ): Promise<FarmingGameView> {
    if (neighborId === user.id) {
      throw new HttpError(400, "FARMING_CANNOT_VISIT_SELF", "不能访问自己的农场");
    }
    return this.serializedMany([neighborId], async () => {
      const neighbor = await this.loadExisting(neighborId);
      return getFarmingGameView(neighbor, user.id, this.clock());
    });
  }

  async applyVisitAction(
    user: PublicUser,
    neighborId: string,
    expectedRevision: number,
    expectedNeighborRevision: number,
    action: FarmVisitClientAction,
  ): Promise<FarmVisitSnapshot> {
    if (neighborId === user.id) {
      throw new HttpError(400, "FARMING_CANNOT_VISIT_SELF", "不能访问自己的农场");
    }
    return this.serializedMany([user.id, neighborId], async () => {
      const visitor = await this.loadOrCreate(user);
      const owner = await this.loadExisting(neighborId);
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
      await this.store.savePair(
        result!.owner.ownerId,
        result!.owner,
        result!.visitor.ownerId,
        result!.visitor,
      );
      return {
        ...(await this.snapshot(result!.visitor, user.id)),
        neighbor: getFarmingGameView(result!.owner, user.id, this.clock()),
        outcome: result!.outcome,
      };
    });
  }

  async getOrCreateRanch(user: PublicUser): Promise<RanchSnapshot> {
    return this.serializedMany([user.id], async () => {
      const farm = await this.loadOrCreate(user);
      const ranch = await this.loadOrCreateRanch(user);
      return this.ranchSnapshot(ranch, farm, user.id);
    });
  }

  async applyRanchAction(
    user: PublicUser,
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    action: RanchClientAction,
  ): Promise<RanchActionSnapshot> {
    return this.serializedMany([user.id], async () => {
      const farm = await this.loadOrCreate(user);
      const ranch = await this.loadOrCreateRanch(user);
      this.assertRevision(farm, expectedFarmRevision);
      this.assertRanchRevision(ranch, expectedRanchRevision);
      let result: ReturnType<typeof applyRanchAction>;
      try {
        result = applyRanchAction(ranch, {
          farmRevision: farm.revision,
          farmLevel: farm.level,
          coins: farm.coins,
          produce: farm.produce,
        }, action, this.clock());
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
      await this.store.saveFarmAndRanch(user.id, nextFarm, result!.ranch);
      return {
        ranch: this.ranchView(result!.ranch, nextFarm, user.id),
      };
    });
  }

  async getRanchNeighbors(user: PublicUser): Promise<RanchNeighborSummary[]> {
    return this.ranchNeighborSummaries(user.id);
  }

  async getRanchNeighbor(
    user: PublicUser,
    neighborId: string,
  ): Promise<RanchGameView> {
    if (neighborId === user.id) {
      throw new HttpError(400, "RANCH_CANNOT_VISIT_SELF", "不能访问自己的牧场");
    }
    return this.serializedMany([neighborId], async () => {
      const ranch = await this.loadExistingRanch(neighborId);
      const farm = await this.loadExisting(neighborId);
      return this.ranchView(ranch, farm, user.id);
    });
  }

  async applyRanchVisitAction(
    user: PublicUser,
    neighborId: string,
    expectedRanchRevision: number,
    expectedNeighborRevision: number,
    action: RanchVisitClientAction,
  ): Promise<RanchVisitSnapshot> {
    if (neighborId === user.id) {
      throw new HttpError(400, "RANCH_CANNOT_VISIT_SELF", "不能访问自己的牧场");
    }
    return this.serializedMany([user.id, neighborId], async () => {
      const visitorFarm = await this.loadOrCreate(user);
      if (visitorFarm.level < 3) {
        throw new HttpError(400, "RANCH_LOCKED", "农场达到 3 级后开放牧场");
      }
      const visitor = await this.loadOrCreateRanch(user);
      const owner = await this.loadExistingRanch(neighborId);
      const ownerFarm = await this.loadExisting(neighborId);
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
      await this.store.saveRanchPair(
        result!.owner.ownerId,
        result!.owner,
        result!.visitor.ownerId,
        result!.visitor,
      );
      return {
        ...(await this.ranchSnapshot(result!.visitor, visitorFarm, user.id)),
        neighbor: this.ranchView(result!.owner, ownerFarm, user.id),
        outcome: result!.outcome,
      };
    });
  }

  async getOrCreateMine(user: PublicUser): Promise<MineSnapshot> {
    return this.serializedMany([user.id], async () => {
      const farm = await this.loadOrCreate(user);
      const ranch = await this.loadOrCreateRanch(user);
      const mine = await this.loadOrCreateMine(user);
      return { mine: this.mineView(mine, farm, ranch) };
    });
  }

  async applyMineAction(
    user: PublicUser,
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    expectedMineRevision: number,
    action: MineClientAction,
  ): Promise<MineSnapshot> {
    return this.serializedMany([user.id], async () => {
      const farm = await this.loadOrCreate(user);
      const ranch = await this.loadOrCreateRanch(user);
      const mine = await this.loadOrCreateMine(user);
      this.assertRevision(farm, expectedFarmRevision);
      this.assertRanchRevision(ranch, expectedRanchRevision);
      this.assertMineRevision(mine, expectedMineRevision);
      let result: ReturnType<typeof applyMineAction>;
      try {
        result = applyMineAction(mine, {
          farmRevision: farm.revision,
          farmLevel: farm.level,
          coins: farm.coins,
          farmProduce: farm.produce,
          ranchRevision: ranch.revision,
          ranchLevel: ranch.level,
          ranchProducts: ranch.products,
        }, action, this.clock());
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
      await this.store.saveHomestead(
        user.id,
        nextFarm,
        nextRanch,
        result!.mine,
      );
      return { mine: this.mineView(result!.mine, nextFarm, nextRanch) };
    });
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

  private async neighborSummaries(
    userId: string,
  ): Promise<FarmingNeighborSummary[]> {
    const now = this.clock();
    const loaded = await this.store.list(40);
    return loaded
      .flatMap((candidate) => {
        try {
          assertRestorableFarmingGameState(candidate);
          const summary = getFarmingNeighborSummary(candidate, userId, now);
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
  ): Promise<FarmSnapshot> {
    return {
      farm: getFarmingGameView(game, userId, this.clock()),
      neighbors: await this.neighborSummaries(userId),
      marketDirectorAvailable: this.marketDirectorAvailable,
    };
  }

  private async ranchNeighborSummaries(
    userId: string,
  ): Promise<RanchNeighborSummary[]> {
    const now = this.clock();
    const loaded = await this.store.listRanches(40);
    return loaded
      .flatMap((candidate) => {
        try {
          assertRestorableRanchGameState(candidate);
          const summary = getRanchNeighborSummary(candidate, userId, now);
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
  ): Promise<RanchSnapshot> {
    return {
      ranch: this.ranchView(ranch, farm, userId),
      neighbors: await this.ranchNeighborSummaries(userId),
    };
  }

  private ranchView(
    ranch: RanchGameState,
    farm: FarmingGameState,
    viewerId: string,
  ): RanchGameView {
    return getRanchGameView(ranch, {
      viewerId,
      now: this.clock(),
      farmRevision: farm.revision,
      farmLevel: farm.level,
      dogLevel: farm.dogLevel,
      ...(viewerId === farm.ownerId
        ? { coins: farm.coins, produce: farm.produce }
      : {}),
    });
  }

  private mineView(
    mine: MineGameState,
    farm: FarmingGameState,
    ranch: RanchGameState,
  ): MineGameView {
    return getMineGameView(mine, {
      farmRevision: farm.revision,
      farmLevel: farm.level,
      coins: farm.coins,
      farmProduce: farm.produce,
      ranchRevision: ranch.revision,
      ranchLevel: ranch.level,
      ranchProducts: ranch.products,
    }, this.clock());
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
      return await operation();
    } finally {
      release();
      for (const userId of uniqueIds) {
        if (this.queues.get(userId) === queued) this.queues.delete(userId);
      }
    }
  }
}
