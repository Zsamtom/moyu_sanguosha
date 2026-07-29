import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import {
  applyFarmAction,
  applyFarmMarketDecision,
  assertRestorableFarmGameState,
  createFarmGame,
  FarmRuleError,
  getFarmGameView,
  type FarmAction,
  type FarmGameState,
  type FarmGameView,
} from "@sanguosha/shared";
import type { BotDecisionRegistry } from "./bots/decision-registry.js";
import { createFarmMarketDecision } from "./bots/farm-market-llm.js";
import { HttpError } from "./errors.js";
import type { PublicUser } from "./users.js";

export type FarmClientAction =
  | Omit<Extract<FarmAction, { type: "farm_buy_seed" }>, "playerId">
  | Omit<Extract<FarmAction, { type: "farm_plant" }>, "playerId">
  | Omit<Extract<FarmAction, { type: "farm_water" }>, "playerId">
  | Omit<Extract<FarmAction, { type: "farm_harvest" }>, "playerId">
  | Omit<Extract<FarmAction, { type: "farm_sell" }>, "playerId">
  | Omit<Extract<FarmAction, { type: "farm_end_turn" }>, "playerId">;

export interface FarmSnapshot {
  readonly farm: FarmGameView;
  readonly marketDirectorAvailable: boolean;
}

export interface FarmStateStore {
  load(userId: string): Promise<unknown | undefined>;
  save(userId: string, state: FarmGameState): Promise<void>;
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

  async save(userId: string, state: FarmGameState): Promise<void> {
    await this.pool.query(
      `INSERT INTO farm_state (user_id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = NOW()`,
      [userId, JSON.stringify(state)],
    );
  }
}

export class MemoryFarmStateStore implements FarmStateStore {
  private readonly states = new Map<string, FarmGameState>();

  async load(userId: string): Promise<unknown | undefined> {
    const state = this.states.get(userId);
    return state ? structuredClone(state) : undefined;
  }

  async save(userId: string, state: FarmGameState): Promise<void> {
    this.states.set(userId, structuredClone(state));
  }
}

export class FarmService {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: FarmStateStore,
    private readonly decisions: BotDecisionRegistry,
  ) {}

  get marketDirectorAvailable(): boolean {
    return this.decisions.supports("farm");
  }

  async getOrCreate(user: PublicUser): Promise<FarmSnapshot> {
    return this.serialized(user.id, async () => {
      const game = await this.loadOrCreate(user);
      return this.snapshot(game, user.id);
    });
  }

  async applyAction(
    user: PublicUser,
    expectedRevision: number,
    action: FarmClientAction,
  ): Promise<FarmSnapshot> {
    return this.serialized(user.id, async () => {
      let game = await this.loadOrCreate(user);
      if (game.revision !== expectedRevision) {
        throw new HttpError(409, "FARM_REVISION_CONFLICT", "农场存档已更新，请刷新后重试");
      }
      try {
        game = applyFarmAction(game, { ...action, playerId: user.id } as FarmAction);
      } catch (error) {
        if (error instanceof FarmRuleError) {
          throw new HttpError(400, error.code, error.message);
        }
        throw error;
      }

      if (action.type === "farm_end_turn" && game.status === "playing") {
        // Commit the authoritative rules result before an optional network call.
        // A model timeout or process interruption can never erase the player's day.
        await this.store.save(user.id, game);
        game = await this.applyMarketDirector(game, user.id);
      }
      await this.store.save(user.id, game);
      return this.snapshot(game, user.id);
    });
  }

  async reset(user: PublicUser): Promise<FarmSnapshot> {
    return this.serialized(user.id, async () => {
      const current = await this.loadOrCreate(user);
      if (current.status !== "finished") {
        throw new HttpError(409, "FARM_STILL_ACTIVE", "当前经营周期尚未结束");
      }
      const game = this.create(user);
      await this.store.save(user.id, game);
      return this.snapshot(game, user.id);
    });
  }

  private async loadOrCreate(user: PublicUser): Promise<FarmGameState> {
    const loaded = await this.store.load(user.id);
    if (loaded === undefined) {
      const game = this.create(user);
      await this.store.save(user.id, game);
      return game;
    }
    assertRestorableFarmGameState(loaded);
    if (loaded.players[0]!.id !== user.id) {
      throw new Error("Farm save owner does not match the authenticated user");
    }
    if (loaded.players[0]!.name !== user.displayName) {
      loaded.players[0] = { ...loaded.players[0]!, name: user.displayName };
      await this.store.save(user.id, loaded);
    }
    return loaded;
  }

  private create(user: PublicUser): FarmGameState {
    return createFarmGame({
      players: [{ id: user.id, name: user.displayName }],
      seed: randomBytes(24).toString("hex"),
    });
  }

  private async applyMarketDirector(
    game: FarmGameState,
    playerId: string,
  ): Promise<FarmGameState> {
    const request = createFarmMarketDecision(game, playerId);
    if (!request) return game;
    try {
      const result = await this.decisions.decide("farm", request.input);
      const selected = result?.candidateIndex === null || result === null
        ? undefined
        : request.input.candidates[result.candidateIndex];
      return selected ? applyFarmMarketDecision(game, selected) : game;
    } catch (error) {
      console.error("Farm market director failed; using rules fallback", error);
      return game;
    }
  }

  private snapshot(game: FarmGameState, userId: string): FarmSnapshot {
    return {
      farm: getFarmGameView(game, userId),
      marketDirectorAvailable: this.marketDirectorAvailable,
    };
  }

  private async serialized<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => gate);
    this.queues.set(userId, queued);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.queues.get(userId) === queued) this.queues.delete(userId);
    }
  }
}
